import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/prisma/generated/client";
import { RELAY_URLS, CACHE_URL } from "@/lib/constants";

interface CountRow {
  relay: string;
  cnt: number | bigint;
}

interface UptimeRow {
  relay: string;
  total: number | bigint;
  ok: number | bigint;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const allUrls = [...RELAY_URLS, CACHE_URL];

  // Fix #3: Per-relay queries with limit, leveraging @@index([relay, checkedAt])
  const checksByRelay = new Map<
    string,
    Awaited<ReturnType<typeof prisma.relayCheck.findMany>>
  >();
  await Promise.all(
    allUrls.map(async (url) => {
      const checks = await prisma.relayCheck.findMany({
        where: { relay: url },
        orderBy: { checkedAt: "desc" },
        take: 144,
      });
      checksByRelay.set(url, checks);
    })
  );

  // Fix #1: Use $queryRaw tagged template with Prisma.join for safe parameterization
  const urlList = Prisma.join(allUrls);

  const [eventCounts, uptime24hRows, uptime7dRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT relay, COUNT(*) AS cnt
      FROM EventSource
      WHERE relay IN (${urlList})
      GROUP BY relay`,

    prisma.$queryRaw<UptimeRow[]>`
      SELECT relay, COUNT(*) AS total, SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok
      FROM RelayCheck
      WHERE relay IN (${urlList})
        AND checkedAt >= datetime('now', '-24 hours')
      GROUP BY relay`,

    prisma.$queryRaw<UptimeRow[]>`
      SELECT relay, COUNT(*) AS total, SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok
      FROM RelayCheck
      WHERE relay IN (${urlList})
        AND checkedAt >= datetime('now', '-7 days')
      GROUP BY relay`,
  ]);

  // Index helper maps
  const eventCountMap = new Map<string, number>(
    eventCounts.map((r: CountRow) => [r.relay, Number(r.cnt)])
  );

  function computeUptime(rows: UptimeRow[]): Map<string, number | null> {
    return new Map(
      rows.map((r: UptimeRow) => [
        r.relay,
        Number(r.total) > 0
          ? Math.round((Number(r.ok) / Number(r.total)) * 10000) / 100
          : null,
      ])
    );
  }

  const uptime24hMap = computeUptime(uptime24hRows);
  const uptime7dMap = computeUptime(uptime7dRows);

  // Fetch Relay backoff state
  const relayStates = await prisma.relay.findMany({
    where: { url: { in: allUrls } },
    select: { url: true, consecutiveErrors: true, backoffUntil: true },
  });
  const relayStateMap = new Map(relayStates.map((r) => [r.url, r]));

  // Fix #5: Send compact check arrays instead of full objects
  const relays = allUrls.map((url) => {
    const checks = checksByRelay.get(url) ?? [];
    const latest = checks[0];
    const totalEvents: number = eventCountMap.get(url) ?? 0;
    const state = relayStateMap.get(url);

    return {
      relay: url,
      status: latest?.status ?? "unknown",
      latencyMs: latest?.latencyMs ?? null,
      error: latest?.error ?? null,
      lastChecked: latest?.checkedAt?.toISOString() ?? null,
      uptime24h: uptime24hMap.get(url) ?? null,
      uptime7d: uptime7dMap.get(url) ?? null,
      totalEvents,
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

  // Fix #7: Cache-Control header — data only changes every 10 minutes
  return NextResponse.json(relays, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
