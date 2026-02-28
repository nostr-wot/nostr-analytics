import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveInput } from "@/lib/nostr";
import { requireAuth } from "@/lib/auth";
import type { NostrProfile } from "@/lib/types";

// GET /api/npubs - list all tracked npubs
export async function GET() {
  const npubs = await prisma.trackedNpub.findMany({
    orderBy: { addedAt: "desc" },
  });

  const withStats = npubs.map((n) => {
    let profile: NostrProfile | null = null;
    if (n.cachedProfile) {
      try {
        profile = JSON.parse(n.cachedProfile);
      } catch {
        // invalid JSON
      }
    }

    return {
      id: n.id,
      npub: n.npub,
      pubkeyHex: n.pubkeyHex,
      label: n.label,
      addedAt: n.addedAt,
      lastFetchedAt: n.lastFetchedAt,
      eventCount: n.cachedEventCount,
      cacheCount: n.cachedCacheCount,
      profile,
    };
  });

  return NextResponse.json(withStats);
}

// POST /api/npubs - add npubs (bulk)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { npubs } = body as { npubs: string[] };

  if (!npubs || !Array.isArray(npubs) || npubs.length === 0) {
    return NextResponse.json(
      { error: "npubs array is required" },
      { status: 400 }
    );
  }

  const results: { npub: string; status: string; error?: string }[] = [];

  for (const npub of npubs) {
    const trimmed = npub.trim();
    if (!trimmed) continue;

    const resolved = resolveInput(trimmed);
    if (!resolved) {
      results.push({ npub: trimmed, status: "error", error: "Invalid npub or hex pubkey" });
      continue;
    }

    try {
      await prisma.trackedNpub.create({
        data: { npub: resolved.npub, pubkeyHex: resolved.pubkeyHex },
      });
      results.push({ npub: resolved.npub, status: "added" });
    } catch {
      results.push({ npub: resolved.npub, status: "exists" });
    }
  }

  return NextResponse.json({ results });
}

// DELETE /api/npubs - remove npubs (bulk)
export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { npubs } = body as { npubs: string[] };

  if (!npubs || !Array.isArray(npubs) || npubs.length === 0) {
    return NextResponse.json(
      { error: "npubs array is required" },
      { status: 400 }
    );
  }

  const deleted: string[] = [];

  for (const npub of npubs) {
    const trimmed = npub.trim();
    const resolved = resolveInput(trimmed);
    try {
      if (resolved) {
        await prisma.trackedNpub.delete({ where: { npub: resolved.npub } });
      } else {
        await prisma.trackedNpub.delete({ where: { npub: trimmed } });
      }
      deleted.push(trimmed);
    } catch {
      // not found, skip
    }
  }

  return NextResponse.json({ deleted });
}
