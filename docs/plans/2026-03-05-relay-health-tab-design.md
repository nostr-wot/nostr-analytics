# Relay Health Tab & Behavioral Insights — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Relay Health" tab to the npub profile page that scores NIP-65 relay list quality, detects special-purpose relays, provides recommendations, and shows timezone/travel timeline.

**Architecture:** All analysis is precomputed in `stats-cron.ts` and stored as JSON in two new `PubkeyStats` columns (`relayHealthScore`, `timezoneTimeline`). The API returns these alongside existing analytics data. A new `RelayHealthTab` component renders the report card, relay table, and timezone timeline. The existing `AnalyticsTab` shows a warning badge linking to the new tab when issues exist.

**Tech Stack:** Prisma/SQLite schema migration, TypeScript analysis functions, React components, Tailwind CSS, existing dark zinc theme.

---

### Task 1: Schema migration — add columns to PubkeyStats

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add two new columns to PubkeyStats model**

In `prisma/schema.prisma`, add after the `nip65Relays` line (line 101):

```prisma
  relayHealthScore    String?  // JSON: RelayHealthReport
  timezoneTimeline    String?  // JSON: TimezoneWindow[]
```

**Step 2: Generate and run migration**

```bash
npx prisma migrate dev --name add_relay_health_and_timezone_timeline
```

**Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add relayHealthScore and timezoneTimeline columns to PubkeyStats"
```

---

### Task 2: Add types for relay health and timezone timeline

**Files:**
- Modify: `lib/types.ts`

**Step 1: Add the new types**

Add after the `Nip65Relay` interface (line 108):

```typescript
// ── Relay Health Report types ───────────────────────────────────────

export type RelayHealthSeverity = "error" | "warning" | "info";
export type RelayHealthScore = "good" | "needs-attention" | "poor";

export interface RelayHealthIssue {
  id: string;           // e.g. "dead-relay", "centralization"
  severity: RelayHealthSeverity;
  title: string;
  description: string;
  relays?: string[];    // affected relay URLs
}

export interface RelayHealthReport {
  score: RelayHealthScore;
  issues: RelayHealthIssue[];
  recommendations: string[];
}

// ── Timezone Timeline types ─────────────────────────────────────────

export interface TimezoneWindow {
  period: string;              // "2025-01" (month)
  estimatedOffset: number;     // UTC offset (e.g. 1, -5)
  confidence: "low" | "medium" | "high";
  eventCount: number;
}
```

**Step 2: Add `relayHealth` and `timezoneTimeline` to `AnalyticsData`**

In the `AnalyticsData` interface, add after `nip65Relays`:

```typescript
  relayHealth: RelayHealthReport | null;
  timezoneTimeline: TimezoneWindow[];
```

**Step 3: Add `DetailTab` value**

Change the `DetailTab` type from:
```typescript
export type DetailTab = "events" | "cache" | "analytics";
```
To:
```typescript
export type DetailTab = "events" | "cache" | "analytics" | "relay-health";
```

**Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add RelayHealthReport and TimezoneWindow types"
```

---

### Task 3: Implement relay health analysis function

**Files:**
- Create: `lib/relay-health-analyzer.ts`

**Step 1: Create the analysis module**

This is a pure function that takes NIP-65 relay data and relay distribution, and returns a `RelayHealthReport`. No DB access — it operates on already-computed data.

```typescript
import type { Nip65Relay, RelayCount, RelayHealthReport, RelayHealthIssue } from "./types";

const SPECIAL_PURPOSE_PATTERNS = [
  { pattern: /nwc/i, label: "Nostr Wallet Connect" },
  { pattern: /wallet/i, label: "wallet" },
  { pattern: /alby/i, label: "Alby (wallet)" },
  { pattern: /mutiny/i, label: "Mutiny (wallet)" },
  { pattern: /coinos/i, label: "Coinos (wallet)" },
  { pattern: /dvm/i, label: "DVM (data vending machine)" },
  { pattern: /pay/i, label: "payment" },
];

export function analyzeRelayHealth(
  nip65Relays: Nip65Relay[],
  relayDistribution: RelayCount[],
  totalEvents: number,
): RelayHealthReport {
  const issues: RelayHealthIssue[] = [];
  const recommendations: string[] = [];

  if (nip65Relays.length === 0) {
    return {
      score: "poor",
      issues: [{ id: "no-relay-list", severity: "error", title: "No relay list", description: "This user has no NIP-65 relay list (kind 10002). Other clients cannot discover where to find or send events." }],
      recommendations: ["Publish a NIP-65 relay list with at least 3-5 write relays and 3-5 read relays."],
    };
  }

  const writeRelays = nip65Relays.filter((r) => r.marker === "write" || r.marker === "both");
  const readRelays = nip65Relays.filter((r) => r.marker === "read" || r.marker === "both");

  // Check: dead relays (unreachable)
  const deadRelays = nip65Relays.filter((r) => r.health === "unreachable");
  if (deadRelays.length > 0) {
    issues.push({
      id: "dead-relays",
      severity: "error",
      title: `${deadRelays.length} unreachable relay${deadRelays.length > 1 ? "s" : ""}`,
      description: "These declared relays failed health checks in the last 24 hours.",
      relays: deadRelays.map((r) => r.url),
    });
    for (const r of deadRelays) {
      let host: string;
      try { host = new URL(r.url).hostname; } catch { host = r.url; }
      recommendations.push(`Remove ${host} — unreachable, not storing your events.`);
    }
  }

  // Check: zero-event relays (reachable but empty)
  const zeroEventRelays = nip65Relays.filter(
    (r) => r.health !== "unreachable" && r.eventPercent === 0 && (r.marker === "write" || r.marker === "both")
  );
  if (zeroEventRelays.length > 0) {
    issues.push({
      id: "zero-event-relays",
      severity: "warning",
      title: `${zeroEventRelays.length} write relay${zeroEventRelays.length > 1 ? "s" : ""} with 0 events`,
      description: "These relays are declared for writing but store none of this user's events.",
      relays: zeroEventRelays.map((r) => r.url),
    });
    for (const r of zeroEventRelays) {
      let host: string;
      try { host = new URL(r.url).hostname; } catch { host = r.url; }
      recommendations.push(`Check ${host} — declared as write relay but holds no events. May need re-publishing or removal.`);
    }
  }

  // Check: over-centralization
  if (totalEvents > 0) {
    const topRelay = relayDistribution[0];
    if (topRelay) {
      const topPercent = (topRelay.count / totalEvents) * 100;
      if (topPercent > 60) {
        let host: string;
        try { host = new URL(topRelay.relay).hostname; } catch { host = topRelay.relay; }
        issues.push({
          id: "centralization",
          severity: "warning",
          title: "Event storage is centralized",
          description: `${Math.round(topPercent)}% of events are on ${host}. If this relay goes down, most events become unavailable.`,
          relays: [topRelay.relay],
        });
        recommendations.push("Distribute events across more relays to reduce single-relay dependency.");
      }
    }
  }

  // Check: too few write relays
  if (writeRelays.length < 3) {
    issues.push({
      id: "few-write-relays",
      severity: "warning",
      title: `Only ${writeRelays.length} write relay${writeRelays.length !== 1 ? "s" : ""}`,
      description: "Fewer than 3 write relays means limited redundancy. If one goes down, discoverability drops significantly.",
    });
    recommendations.push("Add more write relays (aim for 3-5) for better redundancy.");
  }

  // Check: too many relays
  if (nip65Relays.length > 10) {
    issues.push({
      id: "too-many-relays",
      severity: "info",
      title: `${nip65Relays.length} relays declared`,
      description: "More than 10 relays has diminishing returns and slows publishing.",
    });
    recommendations.push("Consider reducing to 5-8 relays for faster publishing and simpler management.");
  }

  // Check: special-purpose relays
  const specialRelays: { url: string; label: string }[] = [];
  for (const relay of nip65Relays) {
    for (const { pattern, label } of SPECIAL_PURPOSE_PATTERNS) {
      if (pattern.test(relay.url)) {
        specialRelays.push({ url: relay.url, label });
        break;
      }
    }
  }
  if (specialRelays.length > 0) {
    issues.push({
      id: "special-purpose-relays",
      severity: "warning",
      title: `${specialRelays.length} special-purpose relay${specialRelays.length > 1 ? "s" : ""} in list`,
      description: `Relays meant for specific protocols (wallet connect, payments, DVMs) shouldn't be in a general relay list: ${specialRelays.map((r) => r.label).join(", ")}.`,
      relays: specialRelays.map((r) => r.url),
    });
    for (const r of specialRelays) {
      let host: string;
      try { host = new URL(r.url).hostname; } catch { host = r.url; }
      recommendations.push(`Remove ${host} — appears to be a ${r.label} relay, not a general-purpose relay.`);
    }
  }

  // Score
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  let score: "good" | "needs-attention" | "poor";
  if (errorCount > 0 || warningCount >= 3) {
    score = "poor";
  } else if (warningCount > 0) {
    score = "needs-attention";
  } else {
    score = "good";
  }

  return { score, issues, recommendations };
}
```

**Step 2: Commit**

```bash
git add lib/relay-health-analyzer.ts
git commit -m "feat: add relay health analysis function"
```

---

### Task 4: Implement timezone timeline computation

**Files:**
- Modify: `lib/timezone-estimator.ts`

**Step 1: Add the `computeTimezoneTimeline` function**

Add at the end of `lib/timezone-estimator.ts`:

```typescript
export interface TimezoneWindowResult {
  period: string;          // "2025-01"
  estimatedOffset: number;
  confidence: "low" | "medium" | "high";
  eventCount: number;
}

/**
 * Compute timezone estimates per month using the sleep-gap algorithm.
 * Groups timestamps by month and runs estimation on each month.
 */
export function computeTimezoneTimeline(
  timestamps: number[]
): TimezoneWindowResult[] {
  if (timestamps.length === 0) return [];

  // Group timestamps by month
  const monthMap = new Map<string, number[]>();
  for (const ts of timestamps) {
    const date = new Date(ts * 1000);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const arr = monthMap.get(month) ?? [];
    arr.push(ts);
    monthMap.set(month, arr);
  }

  // Sort months chronologically
  const sortedMonths = [...monthMap.keys()].sort();

  const results: TimezoneWindowResult[] = [];
  for (const month of sortedMonths) {
    const monthTimestamps = monthMap.get(month)!;
    const estimate = estimateTimezone({ timestamps: monthTimestamps });
    if (estimate) {
      results.push({
        period: month,
        estimatedOffset: estimate.estimatedUtcOffset,
        confidence: estimate.confidence,
        eventCount: monthTimestamps.length,
      });
    }
  }

  return results;
}
```

**Step 2: Commit**

```bash
git add lib/timezone-estimator.ts
git commit -m "feat: add computeTimezoneTimeline for monthly timezone analysis"
```

---

### Task 5: Integrate health analysis and timezone timeline into stats-cron

**Files:**
- Modify: `lib/stats-cron.ts`

**Step 1: Add imports at top of file**

After existing import (line 1):

```typescript
import { analyzeRelayHealth } from "@/lib/relay-health-analyzer";
import { computeTimezoneTimeline } from "@/lib/timezone-estimator";
import type { Nip65Relay, RelayCount } from "@/lib/types";
```

**Step 2: Add computation after nip65Relays is built**

After `nip65Relays = JSON.stringify(nip65List);` (line 198), add:

```typescript
        // Compute relay health report
        const relayHealthReport = analyzeRelayHealth(nip65List, relayDistribution, totalEvents);
        relayHealthScore = JSON.stringify(relayHealthReport);
```

And before the nip65Relays block (around line 134), declare:

```typescript
  let relayHealthScore: string | null = null;
```

**Step 3: Add timezone timeline computation**

After the `nip65Relays` block (after line 203), add:

```typescript
  // Compute timezone timeline (monthly timezone estimates)
  let timezoneTimeline: string | null = null;
  const allTimestamps = await prisma.$queryRawUnsafe<{ createdAt: number }[]>(
    `SELECT createdAt FROM NostrEvent WHERE pubkeyHex = ? ORDER BY createdAt`,
    pubkeyHex
  );
  if (allTimestamps.length > 0) {
    const timeline = computeTimezoneTimeline(allTimestamps.map((r) => r.createdAt));
    if (timeline.length > 0) {
      timezoneTimeline = JSON.stringify(timeline);
    }
  }
```

**Step 4: Add new fields to the upsert**

In the `prisma.pubkeyStats.upsert` call (lines 205-227), add `relayHealthScore` and `timezoneTimeline` to both `create` and `update` objects:

```typescript
      relayHealthScore,
      timezoneTimeline,
```

**Step 5: Commit**

```bash
git add lib/stats-cron.ts
git commit -m "feat: compute relay health and timezone timeline in stats cron"
```

---

### Task 6: Return new data from the analytics API

**Files:**
- Modify: `app/api/events/analytics/route.ts`

**Step 1: Add imports**

Add to the import from `@/lib/types` (line 3):

```typescript
RelayHealthReport, TimezoneWindow
```

**Step 2: Parse the new fields from pubkeyStats**

After the `nip65Relays` parsing block (after line 199), add:

```typescript
  // Relay health report from pre-computed stats
  let relayHealth: RelayHealthReport | null = null;
  if (pubkeyStats?.relayHealthScore) {
    try {
      relayHealth = JSON.parse(pubkeyStats.relayHealthScore);
    } catch {
      // invalid JSON
    }
  }

  // Timezone timeline from pre-computed stats
  let timezoneTimeline: TimezoneWindow[] = [];
  if (pubkeyStats?.timezoneTimeline) {
    try {
      timezoneTimeline = JSON.parse(pubkeyStats.timezoneTimeline);
    } catch {
      // invalid JSON
    }
  }
```

**Step 3: Add to the response object**

In the `data: AnalyticsData` object (line 207), add:

```typescript
    relayHealth,
    timezoneTimeline,
```

**Step 4: Commit**

```bash
git add app/api/events/analytics/route.ts
git commit -m "feat: return relay health and timezone timeline from analytics API"
```

---

### Task 7: Create RelayHealthTab component

**Files:**
- Create: `app/components/RelayHealthTab.tsx`

**Step 1: Create the component**

This component receives `AnalyticsData` and renders three sections: report card, relay table, and timezone timeline.

```tsx
"use client";

import type { AnalyticsData, RelayHealthScore, RelayHealthSeverity, TimezoneWindow } from "@/lib/types";

const scoreConfig: Record<RelayHealthScore, { label: string; color: string; bg: string }> = {
  good: { label: "Good", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30" },
  "needs-attention": { label: "Needs Attention", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30" },
  poor: { label: "Poor", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
};

const severityConfig: Record<RelayHealthSeverity, { color: string; border: string }> = {
  error: { color: "text-red-400", border: "border-red-400/30" },
  warning: { color: "text-amber-400", border: "border-amber-400/30" },
  info: { color: "text-blue-400", border: "border-blue-400/30" },
};

function formatOffset(offset: number): string {
  const sign = offset >= 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

export default function RelayHealthTab({ data }: { data: AnalyticsData }) {
  const health = data.relayHealth;
  const nip65 = data.nip65Relays;

  return (
    <div className="space-y-6">
      {/* Section 1: Report Card */}
      {health ? (
        <div className="space-y-4">
          {/* Score badge */}
          <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 ${scoreConfig[health.score].bg}`}>
            <span className={`text-lg font-semibold ${scoreConfig[health.score].color}`}>
              {scoreConfig[health.score].label}
            </span>
            <span className="text-sm text-zinc-400">
              {health.issues.length === 0
                ? "No issues found"
                : `${health.issues.length} issue${health.issues.length > 1 ? "s" : ""} found`}
            </span>
          </div>

          {/* Issues */}
          {health.issues.length > 0 && (
            <div className="space-y-2">
              {health.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-lg border ${severityConfig[issue.severity].border} bg-zinc-900 p-4`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-sm font-medium ${severityConfig[issue.severity].color}`}>
                      {issue.severity === "error" ? "!" : issue.severity === "warning" ? "!" : "i"}
                    </span>
                    <div className="min-w-0">
                      <h4 className={`text-sm font-medium ${severityConfig[issue.severity].color}`}>
                        {issue.title}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1">{issue.description}</p>
                      {issue.relays && issue.relays.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {issue.relays.map((url) => {
                            let host: string;
                            try { host = new URL(url).hostname; } catch { host = url; }
                            return (
                              <span key={url} className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                {host}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {health.recommendations.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {health.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                    <span className="text-zinc-600 mt-0.5">-</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No relay health data available. Stats may need recomputation.</p>
      )}

      {/* Section 2: Relay Table */}
      {nip65.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Declared Relays</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 pr-4 font-medium">Relay</th>
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 font-medium">Health</th>
                  <th className="text-right py-2 pr-4 font-medium">Events</th>
                  <th className="text-right py-2 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {nip65.map((relay) => {
                  let host: string;
                  try { host = new URL(relay.url).hostname; } catch { host = relay.url; }
                  const healthColor = {
                    active: "bg-emerald-400",
                    reachable: "bg-amber-400",
                    unreachable: "bg-red-400",
                    unknown: "bg-zinc-500",
                  }[relay.health];
                  const healthLabel = {
                    active: "Active",
                    reachable: "Reachable",
                    unreachable: "Unreachable",
                    unknown: "Unknown",
                  }[relay.health];
                  const markerLabel = relay.marker === "read" ? "Read" : relay.marker === "write" ? "Write" : "Read/Write";
                  const markerColor = relay.marker === "read" ? "text-blue-400" : relay.marker === "write" ? "text-orange-400" : "text-zinc-300";
                  // Check if special-purpose
                  const isSpecial = /nwc|wallet|alby|mutiny|coinos|dvm|pay/i.test(relay.url);
                  const eventCount = data.totalEvents > 0 ? Math.round(relay.eventPercent * data.totalEvents / 100) : 0;

                  return (
                    <tr key={relay.url} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-zinc-200">{host}</span>
                          {isSpecial && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                              SPECIAL
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`py-2 pr-4 ${markerColor}`}>{markerLabel}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${healthColor}`} />
                          <span className="text-zinc-400">{healthLabel}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400 tabular-nums">{eventCount.toLocaleString()}</td>
                      <td className="py-2 text-right text-zinc-400 tabular-nums">{relay.eventPercent}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Timezone Timeline */}
      {data.timezoneTimeline.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Timezone Timeline</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Estimated timezone per month based on activity patterns. Shifts may indicate travel.
          </p>
          <div className="space-y-1">
            {data.timezoneTimeline.map((w, i) => {
              const prev = i > 0 ? data.timezoneTimeline[i - 1] : null;
              const shifted = prev && prev.estimatedOffset !== w.estimatedOffset;
              return (
                <div
                  key={w.period}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-xs ${
                    shifted ? "bg-amber-500/10 border border-amber-500/20" : "bg-zinc-800/50"
                  }`}
                >
                  <span className="font-mono text-zinc-400 w-16">{w.period}</span>
                  <span className={`font-semibold w-16 ${shifted ? "text-amber-400" : "text-zinc-200"}`}>
                    {formatOffset(w.estimatedOffset)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    w.confidence === "high" ? "bg-emerald-500/20 text-emerald-400"
                    : w.confidence === "medium" ? "bg-zinc-700 text-zinc-300"
                    : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {w.confidence}
                  </span>
                  <span className="text-zinc-600 ml-auto">{w.eventCount} events</span>
                  {shifted && (
                    <span className="text-amber-400 text-[10px] font-medium">
                      shifted from {formatOffset(prev!.estimatedOffset)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/RelayHealthTab.tsx
git commit -m "feat: add RelayHealthTab component"
```

---

### Task 8: Wire RelayHealthTab into the profile page + add warning badge to AnalyticsTab

**Files:**
- Modify: `app/npubs/[npub]/page.tsx`
- Modify: `app/components/AnalyticsTab.tsx`

**Step 1: Add import and state for the new tab**

In `app/npubs/[npub]/page.tsx`, add import (after line 20):

```typescript
import RelayHealthTab from "../../components/RelayHealthTab";
```

The `DetailTab` type already includes `"relay-health"` from Task 2.

**Step 2: Add the "Relay Health" tab button**

After the Analytics tab button (after line 175), add:

```tsx
        <button
          onClick={() => setTab("relay-health")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "relay-health"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Relay Health
        </button>
```

**Step 3: Add RelayHealthTab rendering**

The AnalyticsTab already fetches all analytics data including `relayHealth` and `timezoneTimeline`. But RelayHealthTab needs the same data. The simplest approach: RelayHealthTab fetches the same `/api/events/analytics` endpoint.

Change the content rendering section. The current line 230-231:

```tsx
      {tab === "analytics" ? (
        <AnalyticsTab pubkeyHex={pubkeyHex} npub={npub} />
```

Change to:

```tsx
      {tab === "analytics" ? (
        <AnalyticsTab pubkeyHex={pubkeyHex} npub={npub} onRelayIssues={(count) => setRelayIssueCount(count)} />
      ) : tab === "relay-health" ? (
        <RelayHealthTabWrapper pubkeyHex={pubkeyHex} />
```

Add state near the other useState calls:

```typescript
const [relayIssueCount, setRelayIssueCount] = useState(0);
```

Add a wrapper component at the bottom of the file (or inline):

Actually, simpler approach: have RelayHealthTab fetch its own data like AnalyticsTab does. Add a `RelayHealthTabWrapper`:

Create a small wrapper inside the page file that fetches and renders:

```tsx
function RelayHealthTabWrapper({ pubkeyHex }: { pubkeyHex: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubkeyHex) return;
    fetch(`/api/events/analytics?pubkey=${pubkeyHex}&tz=0`)
      .then((res) => res.json())
      .then((d: AnalyticsData) => { setData(d); setLoading(false); });
  }, [pubkeyHex]);

  if (loading) return <p className="text-sm text-zinc-500">Loading relay health...</p>;
  if (!data) return <p className="text-sm text-zinc-500">No data available.</p>;

  return <RelayHealthTab data={data} />;
}
```

Add `AnalyticsData` to the imports from `@/lib/types`.

**Step 4: Add warning badge to AnalyticsTab**

In `app/components/AnalyticsTab.tsx`, modify the NIP-65 relay list section header (around line 174). After the subtitle line, add a warning badge if issues exist:

```tsx
            {data.relayHealth && data.relayHealth.issues.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {data.relayHealth.issues.length} issue{data.relayHealth.issues.length > 1 ? "s" : ""} — see Relay Health tab
              </span>
            )}
```

**Step 5: Commit**

```bash
git add app/npubs/[npub]/page.tsx app/components/AnalyticsTab.tsx
git commit -m "feat: wire RelayHealthTab into profile page with warning badge in Analytics"
```

---

### Summary

| Task | Action | Files |
|------|--------|-------|
| 1 | Schema migration: add `relayHealthScore`, `timezoneTimeline` | `prisma/schema.prisma` |
| 2 | Add types: `RelayHealthReport`, `TimezoneWindow`, update `AnalyticsData`, `DetailTab` | `lib/types.ts` |
| 3 | Relay health analysis function (pure, no DB) | `lib/relay-health-analyzer.ts` |
| 4 | Timezone timeline computation (per-month sleep-gap analysis) | `lib/timezone-estimator.ts` |
| 5 | Integrate both into `stats-cron.ts` | `lib/stats-cron.ts` |
| 6 | Return new fields from analytics API | `app/api/events/analytics/route.ts` |
| 7 | Create `RelayHealthTab` component (report card + relay table + timezone timeline) | `app/components/RelayHealthTab.tsx` |
| 8 | Wire into profile page, add warning badge to AnalyticsTab | `app/npubs/[npub]/page.tsx`, `app/components/AnalyticsTab.tsx` |
