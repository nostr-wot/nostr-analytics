import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RELAY_URLS, CACHE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const allUrls = [...RELAY_URLS, CACHE_URL];

  // Per-relay check history (compact, leveraging @@index([relay, checkedAt]))
  const checksByRelay = new Map<
    string,
    Awaited<ReturnType<typeof prisma.relayCheck.findMany>>
  >();
  await Promise.all(
    allUrls.map(async (url: string) => {
      const checks = await prisma.relayCheck.findMany({
        where: { relay: url },
        orderBy: { checkedAt: "desc" },
        take: 144,
      });
      checksByRelay.set(url, checks);
    })
  );

  // Pre-computed snapshots + relay backoff state
  const [snapshots, relayStates] = await Promise.all([
    prisma.relaySnapshot.findMany({
      where: { relay: { in: allUrls } },
    }),
    prisma.relay.findMany({
      where: { url: { in: allUrls } },
      select: { url: true, consecutiveErrors: true, backoffUntil: true },
    }),
  ]);

  const snapshotMap = new Map(snapshots.map((s) => [s.relay, s]));
  const relayStateMap = new Map(relayStates.map((r) => [r.url, r]));

  const relays = allUrls.map((url: string) => {
    const checks = checksByRelay.get(url) ?? [];
    const latest = checks[0];
    const snapshot = snapshotMap.get(url);
    const state = relayStateMap.get(url);

    return {
      relay: url,
      status: latest?.status ?? "unknown",
      latencyMs: latest?.latencyMs ?? null,
      error: latest?.error ?? null,
      lastChecked: latest?.checkedAt?.toISOString() ?? null,
      uptime24h: snapshot?.uptime24h ?? null,
      uptime7d: snapshot?.uptime7d ?? null,
      totalEvents: snapshot?.eventCount ?? 0,
      checks: checks.map((c) => ({
        s: c.status === "ok" ? 1 : 0,
        l: c.latencyMs,
      })),
      consecutiveErrors: state?.consecutiveErrors ?? 0,
      backoffUntil: state?.backoffUntil?.toISOString() ?? null,
    };
  });

  // Sort: online first, then by event count desc
  relays.sort((a, b) => {
    const aOnline = a.status === "ok" ? 0 : 1;
    const bOnline = b.status === "ok" ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return b.totalEvents - a.totalEvents;
  });

  return NextResponse.json(relays, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
