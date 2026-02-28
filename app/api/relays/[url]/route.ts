import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TransitionRow {
  status: string;
  checkedAt: string;
}

interface ErrorBreakdownRow {
  errorCategory: string;
  cnt: number | bigint;
}

interface LatencyRow {
  hour: string;
  avgLatency: number;
}

interface UptimeRow {
  total: number | bigint;
  ok: number | bigint;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ url: string }> }
) {
  const { url: rawUrl } = await params;
  const relayUrl = decodeURIComponent(rawUrl);

  // Fetch relay backoff state
  const relay = await prisma.relay.findUnique({ where: { url: relayUrl } });
  if (!relay) {
    return NextResponse.json({ error: "Relay not found" }, { status: 404 });
  }

  // Run queries in parallel
  const [
    latestCheck,
    checks,
    uptime24hRows,
    uptime7dRows,
    totalChecksRows,
    errorBreakdown,
    latencyHistory,
    transitions,
    eventCountRows,
    recentEvents,
  ] = await Promise.all([
    // Latest check
    prisma.relayCheck.findFirst({
      where: { relay: relayUrl },
      orderBy: { checkedAt: "desc" },
    }),

    // Last 144 checks (compact)
    prisma.relayCheck.findMany({
      where: { relay: relayUrl },
      orderBy: { checkedAt: "desc" },
      take: 144,
      select: { status: true, latencyMs: true, checkedAt: true, error: true, errorCategory: true },
    }),

    // 24h uptime
    prisma.$queryRaw<UptimeRow[]>`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok
      FROM RelayCheck
      WHERE relay = ${relayUrl}
        AND checkedAt >= datetime('now', '-24 hours')`,

    // 7d uptime
    prisma.$queryRaw<UptimeRow[]>`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok
      FROM RelayCheck
      WHERE relay = ${relayUrl}
        AND checkedAt >= datetime('now', '-7 days')`,

    // Total check count
    prisma.relayCheck.count({ where: { relay: relayUrl } }),

    // Error breakdown by category (last 7 days)
    prisma.$queryRaw<ErrorBreakdownRow[]>`
      SELECT COALESCE(errorCategory, 'uncategorized') AS errorCategory,
             COUNT(*) AS cnt
      FROM RelayCheck
      WHERE relay = ${relayUrl} AND status = 'error'
        AND checkedAt >= datetime('now', '-7 days')
      GROUP BY errorCategory
      ORDER BY cnt DESC`,

    // Hourly avg latency, last 7 days
    prisma.$queryRaw<LatencyRow[]>`
      SELECT strftime('%Y-%m-%dT%H:00:00', checkedAt) AS hour,
             CAST(AVG(latencyMs) AS INTEGER) AS avgLatency
      FROM RelayCheck
      WHERE relay = ${relayUrl}
        AND status = 'ok'
        AND latencyMs IS NOT NULL
        AND checkedAt >= datetime('now', '-7 days')
      GROUP BY hour
      ORDER BY hour ASC`,

    // Status transitions using LAG()
    prisma.$queryRaw<TransitionRow[]>`
      SELECT status, checkedAt
      FROM (
        SELECT status, checkedAt,
               LAG(status) OVER (ORDER BY checkedAt) AS prevStatus
        FROM RelayCheck
        WHERE relay = ${relayUrl}
        ORDER BY checkedAt ASC
      )
      WHERE prevStatus IS NULL OR status != prevStatus
      ORDER BY checkedAt DESC
      LIMIT 50`,

    // Total events from this relay
    prisma.$queryRaw<{ cnt: number | bigint }[]>`
      SELECT COUNT(*) AS cnt FROM EventSource WHERE relay = ${relayUrl}`,

    // Recent 50 events
    prisma.$queryRaw<{ eventId: string; kind: number; createdAt: number; seenAt: string }[]>`
      SELECT es.eventId, ne.kind, ne.createdAt, es.seenAt
      FROM EventSource es
      JOIN NostrEvent ne ON ne.eventId = es.eventId
      WHERE es.relay = ${relayUrl}
      ORDER BY es.seenAt DESC
      LIMIT 50`,
  ]);

  function computeUptime(rows: UptimeRow[]): number | null {
    const row = rows[0];
    if (!row || Number(row.total) === 0) return null;
    return Math.round((Number(row.ok) / Number(row.total)) * 10000) / 100;
  }

  return NextResponse.json({
    relay: {
      url: relay.url,
      firstSeenAt: relay.firstSeenAt.toISOString(),
      consecutiveErrors: relay.consecutiveErrors,
      backoffUntil: relay.backoffUntil?.toISOString() ?? null,
    },
    uptime: {
      last24h: computeUptime(uptime24hRows),
      last7d: computeUptime(uptime7dRows),
      totalChecks: totalChecksRows,
    },
    latestCheck: latestCheck
      ? {
          status: latestCheck.status,
          latencyMs: latestCheck.latencyMs,
          error: latestCheck.error,
          errorCategory: latestCheck.errorCategory,
          checkedAt: latestCheck.checkedAt.toISOString(),
        }
      : null,
    checks: checks.map((c) => ({
      s: c.status === "ok" ? 1 : 0,
      l: c.latencyMs,
      t: c.checkedAt.toISOString(),
      e: c.errorCategory,
    })),
    errorBreakdown: errorBreakdown.map((r) => ({
      category: r.errorCategory,
      count: Number(r.cnt),
    })),
    latencyHistory: latencyHistory.map((r) => ({
      hour: r.hour,
      avgLatency: Number(r.avgLatency),
    })),
    transitions: transitions.map((r) => ({
      status: r.status,
      at: r.checkedAt,
    })),
    events: {
      total: Number(eventCountRows[0]?.cnt ?? 0),
      recent: recentEvents.map((e) => ({
        eventId: e.eventId,
        kind: e.kind,
        createdAt: e.createdAt,
        seenAt: e.seenAt,
      })),
    },
  });
}
