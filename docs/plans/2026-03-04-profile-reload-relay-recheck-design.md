# Profile Reload & Relay Recheck — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two admin-only actions to the profile page: reload kind 0 metadata, and exhaustively recheck all events from a specific relay to ensure EventSource mappings are complete.

**Architecture:** New exported functions in `lib/collector.ts` (`reloadKind0`, `fetchFromSingleRelayExhaustive`), two new API routes behind `requireAuth`, and a new `ProfileActionBar` component rendered only for admins.

**Tech Stack:** Next.js API routes, Prisma/SQLite, Nostr WebSocket protocol, React client components, existing auth system (`requireAuth` + `useAuth`).

---

### Task 1: Add `reloadKind0()` to collector

**Files:**
- Modify: `lib/collector.ts` (add new exported function after line 297)

**Step 1: Add the `reloadKind0` function**

Add after the `fetchAllForPubkey` export (line 297):

```typescript
export async function reloadKind0(
  pubkeyHex: string
): Promise<{ eventsFound: number; profile: Record<string, unknown> | null }> {
  console.log(`[collector] Reloading kind 0 for ${pubkeyHex.slice(0, 8)}...`);

  const { connectWebSocket } = await import("./websocket");
  let eventsFound = 0;
  const allKind0: NostrEventWire[] = [];

  // Fetch kind 0 from each relay (parallel, skip backed-off relays)
  const now = new Date();
  const relayStates = await prisma.relay.findMany({
    where: { url: { in: RELAY_URLS } },
    select: { url: true, backoffUntil: true },
  });
  const backoffMap = new Map(relayStates.map((r) => [r.url, r.backoffUntil]));
  const activeUrls = RELAY_URLS.filter((url) => {
    const until = backoffMap.get(url);
    return !until || until <= now;
  });

  const relayResults = await Promise.allSettled(
    activeUrls.map(async (relayUrl) => {
      let ws;
      try {
        ws = await connectWebSocket(relayUrl);
      } catch {
        return [];
      }
      try {
        const subId = `kind0_${pubkeyHex.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        sendRelayRequest(ws, subId, {
          authors: [pubkeyHex],
          kinds: [0],
          limit: 10,
        });
        const { events } = await waitForEose(ws, subId, EOSE_TIMEOUT_RELAY);
        if (events.length > 0) {
          await storeNostrEventsBatch(events, relayUrl);
        }
        return events;
      } finally {
        ws.close();
      }
    })
  );

  for (const result of relayResults) {
    if (result.status === "fulfilled") {
      eventsFound += result.value.length;
      allKind0.push(...result.value);
    }
  }

  // Also fetch from cache
  try {
    const ws = await connectWebSocket(CACHE_URL);
    try {
      const subId = `kind0_cache_${pubkeyHex.slice(0, 8)}_${Date.now()}`;
      sendCacheRequest(ws, subId, "user_profile", [
        "user_profile",
        { pubkey: pubkeyHex },
      ]);
      const { events } = await waitForEose(ws, subId);
      if (events.length > 0) {
        await storeNostrEventsBatch(events, CACHE_URL);
        eventsFound += events.length;
        allKind0.push(...events);
      }
    } finally {
      ws.close();
    }
  } catch {
    console.error(`[collector] Failed to fetch kind 0 from cache`);
  }

  // Pick the latest kind 0 and update cached profile
  let profile: Record<string, unknown> | null = null;
  if (allKind0.length > 0) {
    const latest = allKind0.reduce((a, b) =>
      a.created_at >= b.created_at ? a : b
    );
    try {
      profile = JSON.parse(latest.content);
      await prisma.trackedNpub.update({
        where: { pubkeyHex },
        data: { cachedProfile: latest.content },
      });
    } catch {
      // invalid JSON
    }
  }

  // Also check DB for an even newer kind 0 we already had
  const dbKind0 = await prisma.nostrEvent.findFirst({
    where: { pubkeyHex, kind: 0 },
    orderBy: { createdAt: "desc" },
    select: { content: true, createdAt: true },
  });
  if (dbKind0) {
    const bestFetched = allKind0.length > 0
      ? Math.max(...allKind0.map((e) => e.created_at))
      : 0;
    if (dbKind0.createdAt > bestFetched) {
      try {
        profile = JSON.parse(dbKind0.content);
        await prisma.trackedNpub.update({
          where: { pubkeyHex },
          data: { cachedProfile: dbKind0.content },
        });
      } catch {
        // invalid JSON
      }
    }
  }

  console.log(
    `[collector] Kind 0 reload for ${pubkeyHex.slice(0, 8)}: ${eventsFound} events found`
  );

  return { eventsFound, profile };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in collector.ts

**Step 3: Commit**

```bash
git add lib/collector.ts
git commit -m "feat: add reloadKind0() for targeted kind 0 refresh"
```

---

### Task 2: Add `fetchFromSingleRelayExhaustive()` to collector

**Files:**
- Modify: `lib/collector.ts` (add new exported function after `reloadKind0`)

**Step 1: Add the exhaustive relay fetch function**

Add after `reloadKind0`:

```typescript
export async function fetchFromSingleRelayExhaustive(
  relayUrl: string,
  pubkeyHex: string
): Promise<{ totalEvents: number; newEvents: number }> {
  const tag = `${pubkeyHex.slice(0, 8)} ${new URL(relayUrl).hostname}`;
  console.log(`[collector] Exhaustive recheck: ${tag}`);

  const { connectWebSocket } = await import("./websocket");

  let ws;
  try {
    ws = await connectWebSocket(relayUrl);
  } catch (err) {
    console.error(`[collector] Failed to connect to ${relayUrl}:`, err);
    return { totalEvents: 0, newEvents: 0 };
  }

  let totalEvents = 0;
  let totalNewEvents = 0;

  try {
    let until: number | undefined;
    let page = 0;
    let consecutiveRateLimits = 0;
    const MAX_RATE_LIMIT_RETRIES = 5;

    while (true) {
      page++;
      const subId = `exhaust_${pubkeyHex.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const filter: Record<string, unknown> = {
        authors: [pubkeyHex],
        kinds: RELAY_KINDS,
        limit: RELAY_FETCH_LIMIT,
      };
      if (until !== undefined) {
        filter.until = until;
      }

      sendRelayRequest(ws, subId, filter);
      const { events, rateLimited } = await waitForEose(ws, subId, EOSE_TIMEOUT_RELAY);

      if (rateLimited) {
        consecutiveRateLimits++;
        if (consecutiveRateLimits > MAX_RATE_LIMIT_RETRIES) {
          console.log(`[collector] ${tag}: max rate limit retries reached, stopping`);
          break;
        }
        // Exponential backoff: 30s, 60s, 120s, 240s, 300s
        const waitMs = Math.min(30_000 * Math.pow(2, consecutiveRateLimits - 1), 300_000);
        console.log(
          `[collector] ${tag}: rate limited (attempt ${consecutiveRateLimits}/${MAX_RATE_LIMIT_RETRIES}), waiting ${Math.round(waitMs / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        // Reconnect in case the connection was dropped
        try {
          ws.close();
        } catch { /* ignore */ }
        try {
          ws = await connectWebSocket(relayUrl);
        } catch (err) {
          console.error(`[collector] ${tag}: reconnect failed:`, err);
          break;
        }

        page--; // Retry the same page
        continue;
      }

      consecutiveRateLimits = 0; // Reset on success

      if (events.length === 0) {
        console.log(`[collector] ${tag}: relay returned 0 events, done (page ${page})`);
        break;
      }

      totalEvents += events.length;
      const stored = await storeNostrEventsBatch(events, relayUrl);
      totalNewEvents += stored;

      console.log(
        `[collector] ${tag}: page ${page}, ${events.length} fetched, ${stored} new, ${totalEvents} total`
      );

      // Got less than limit — no more pages
      if (events.length < RELAY_FETCH_LIMIT) break;

      // NOTE: Unlike normal fetch, we do NOT stop on all-duplicates.
      // We keep paginating to ensure every event gets an EventSource entry.

      // Paginate backward
      const oldest = Math.min(...events.map((e) => e.created_at));
      until = oldest - 1;
    }
  } finally {
    ws.close();
  }

  console.log(
    `[collector] Exhaustive recheck done: ${tag} — ${totalEvents} total events, ${totalNewEvents} new`
  );

  return { totalEvents, newEvents: totalNewEvents };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in collector.ts

**Step 3: Commit**

```bash
git add lib/collector.ts
git commit -m "feat: add fetchFromSingleRelayExhaustive() for thorough relay recheck"
```

---

### Task 3: Create `POST /api/profile/reload` endpoint

**Files:**
- Create: `app/api/profile/reload/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { reloadKind0 } from "@/lib/collector";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { pubkeyHex } = body as { pubkeyHex?: string };

  if (!pubkeyHex) {
    return NextResponse.json(
      { error: "pubkeyHex is required" },
      { status: 400 }
    );
  }

  const tracked = await prisma.trackedNpub.findUnique({
    where: { pubkeyHex },
  });
  if (!tracked) {
    return NextResponse.json(
      { error: "Pubkey not tracked" },
      { status: 404 }
    );
  }

  const result = await reloadKind0(pubkeyHex);
  return NextResponse.json(result);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/profile/reload/route.ts
git commit -m "feat: add POST /api/profile/reload endpoint (admin-only)"
```

---

### Task 4: Create `POST /api/events/recheck-relay` endpoint

**Files:**
- Create: `app/api/events/recheck-relay/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { fetchFromSingleRelayExhaustive } from "@/lib/collector";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { pubkeyHex, relayUrl } = body as {
    pubkeyHex?: string;
    relayUrl?: string;
  };

  if (!pubkeyHex || !relayUrl) {
    return NextResponse.json(
      { error: "pubkeyHex and relayUrl are required" },
      { status: 400 }
    );
  }

  // Basic URL validation
  try {
    new URL(relayUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid relay URL" },
      { status: 400 }
    );
  }

  const tracked = await prisma.trackedNpub.findUnique({
    where: { pubkeyHex },
  });
  if (!tracked) {
    return NextResponse.json(
      { error: "Pubkey not tracked" },
      { status: 404 }
    );
  }

  const result = await fetchFromSingleRelayExhaustive(relayUrl, pubkeyHex);
  return NextResponse.json(result);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/events/recheck-relay/route.ts
git commit -m "feat: add POST /api/events/recheck-relay endpoint (admin-only)"
```

---

### Task 5: Create `ProfileActionBar` component

**Files:**
- Create: `app/components/ProfileActionBar.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RELAY_URLS } from "@/lib/constants";

interface Props {
  pubkeyHex: string;
  onProfileReloaded: () => void;
}

export default function ProfileActionBar({ pubkeyHex, onProfileReloaded }: Props) {
  const { isAdmin } = useAuth();
  const [reloadingProfile, setReloadingProfile] = useState(false);
  const [recheckingRelay, setRecheckingRelay] = useState(false);
  const [selectedRelay, setSelectedRelay] = useState(RELAY_URLS[0]);
  const [customRelay, setCustomRelay] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  if (!isAdmin) return null;

  const handleReloadProfile = async () => {
    setReloadingProfile(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/reload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeyHex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || "Failed to reload profile", type: "error" });
        return;
      }
      setMessage({
        text: `Profile reloaded — ${data.eventsFound} kind 0 event${data.eventsFound !== 1 ? "s" : ""} found`,
        type: "success",
      });
      onProfileReloaded();
    } catch (err) {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setReloadingProfile(false);
    }
  };

  const handleRecheckRelay = async () => {
    const relayUrl = isCustom ? customRelay.trim() : selectedRelay;
    if (!relayUrl) {
      setMessage({ text: "Please enter a relay URL", type: "error" });
      return;
    }
    try {
      new URL(relayUrl);
    } catch {
      setMessage({ text: "Invalid URL", type: "error" });
      return;
    }

    setRecheckingRelay(true);
    setMessage(null);
    try {
      const res = await fetch("/api/events/recheck-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeyHex, relayUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || "Failed to recheck relay", type: "error" });
        return;
      }
      setMessage({
        text: `Recheck complete — ${data.totalEvents} events found, ${data.newEvents} new`,
        type: "success",
      });
    } catch (err) {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setRecheckingRelay(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Reload Profile */}
        <button
          onClick={handleReloadProfile}
          disabled={reloadingProfile}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reloadingProfile ? "Reloading..." : "Reload Profile"}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-700" />

        {/* Recheck Relay */}
        <div className="flex items-center gap-2">
          <select
            value={isCustom ? "__custom__" : selectedRelay}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setIsCustom(true);
              } else {
                setIsCustom(false);
                setSelectedRelay(e.target.value);
              }
            }}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200"
          >
            {RELAY_URLS.map((url) => (
              <option key={url} value={url}>
                {new URL(url).hostname}
              </option>
            ))}
            <option value="__custom__">Custom URL...</option>
          </select>

          {isCustom && (
            <input
              type="text"
              value={customRelay}
              onChange={(e) => setCustomRelay(e.target.value)}
              placeholder="wss://relay.example.com"
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 w-64"
            />
          )}

          <button
            onClick={handleRecheckRelay}
            disabled={recheckingRelay}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {recheckingRelay ? "Rechecking..." : "Recheck Relay"}
          </button>
        </div>
      </div>

      {/* Feedback message */}
      {message && (
        <p
          className={`text-sm ${
            message.type === "success" ? "text-green-400" : "text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add app/components/ProfileActionBar.tsx
git commit -m "feat: add ProfileActionBar component (admin-only)"
```

---

### Task 6: Wire `ProfileActionBar` into the profile page

**Files:**
- Modify: `app/npub/[npub]/page.tsx` (lines 1-134)

**Step 1: Add the import**

After line 19 (`import AnalyticsTab ...`), add:

```typescript
import ProfileActionBar from "../../components/ProfileActionBar";
```

**Step 2: Get `refresh` from the npub cache hook**

Change line 24 from:

```typescript
const { getByNpub } = useNpubCache();
```

to:

```typescript
const { getByNpub, refresh } = useNpubCache();
```

**Step 3: Add ProfileActionBar between the header and tabs**

After line 134 (`<ProfileHeader ... />`), add:

```tsx
<ProfileActionBar pubkeyHex={pubkeyHex} onProfileReloaded={refresh} />
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 5: Test manually**

1. Log in as admin
2. Navigate to a profile page
3. Verify the action bar appears
4. Click "Reload Profile" — should show success message and refresh header
5. Select a relay and click "Recheck Relay" — should show progress then results
6. Log out — verify the action bar disappears

**Step 6: Commit**

```bash
git add app/npub/[npub]/page.tsx
git commit -m "feat: wire ProfileActionBar into profile page"
```

---

### Task 7: Make `storeNostrEventsBatch` accessible to new exports

**Files:**
- Modify: `lib/collector.ts`

**Note:** `storeNostrEventsBatch` is currently a private function (not exported) but it's used by both new exported functions. Since both `reloadKind0` and `fetchFromSingleRelayExhaustive` are in the same file, this is already fine — no changes needed. This task is just a verification step.

**Step 1: Verify the new functions can access `storeNostrEventsBatch`**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors — both new functions are in `collector.ts` and can access the private function.

---

### Summary of all changes

| Action | File | Description |
|--------|------|-------------|
| Modify | `lib/collector.ts` | Add `reloadKind0()` and `fetchFromSingleRelayExhaustive()` |
| Create | `app/api/profile/reload/route.ts` | Admin-only kind 0 reload endpoint |
| Create | `app/api/events/recheck-relay/route.ts` | Admin-only exhaustive relay recheck endpoint |
| Create | `app/components/ProfileActionBar.tsx` | Action bar with both controls, admin-gated |
| Modify | `app/npub/[npub]/page.tsx` | Import and render `ProfileActionBar` |
