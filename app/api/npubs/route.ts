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

  const withStats = await Promise.all(
    npubs.map(async (n) => {
      const eventCount = await prisma.nostrEvent.count({
        where: { pubkeyHex: n.pubkeyHex },
      });
      const cacheCount = await prisma.cacheResponse.count({
        where: { pubkeyHex: n.pubkeyHex },
      });

      // Get latest kind 0 (Metadata) event for profile info
      let profile: NostrProfile | null = null;
      const kind0 = await prisma.nostrEvent.findFirst({
        where: { pubkeyHex: n.pubkeyHex, kind: 0 },
        orderBy: { createdAt: "desc" },
      });
      if (kind0) {
        try {
          profile = JSON.parse(kind0.content);
        } catch {
          // invalid JSON in kind 0 content
        }
      }

      return { ...n, eventCount, cacheCount, profile };
    })
  );

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
