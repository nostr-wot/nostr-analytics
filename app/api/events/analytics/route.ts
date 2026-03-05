import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { HeatmapCell, DailyBoundary, AnalyticsData, DmHourlyActivity, DmAnalytics, RelayMonthCount, Nip65Relay, RelayHealthReport, TimezoneWindow } from "@/lib/types";

interface HeatmapRow {
  dow: string | number;
  hour: string | number;
  cnt: number | bigint;
}

interface BoundaryRow {
  d: string;
  firstMinute: number | bigint;
  lastMinute: number | bigint;
}

interface RelayTimelineRow {
  relay: string;
  month: string;
  cnt: number | bigint;
}

function buildTzModifier(offset: number): string {
  const sign = offset >= 0 ? "+" : "-";
  return `${sign}${Math.abs(offset)} hours`;
}

// GET /api/events/analytics?pubkey=hex&tz=0&kinds=1,7&relays=wss://...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pubkey = searchParams.get("pubkey");

  if (!pubkey) {
    return NextResponse.json(
      { error: "pubkey query param is required" },
      { status: 400 }
    );
  }

  // Parse timezone offset (integer hours, clamped to [-12, 14])
  const tzRaw = parseInt(searchParams.get("tz") || "0", 10);
  const tzOffset = Math.max(-12, Math.min(14, isNaN(tzRaw) ? 0 : tzRaw));
  const tzMod = buildTzModifier(tzOffset);

  // Parse kind filter (comma-separated integers, optional)
  const kindsParam = searchParams.get("kinds");
  const kindFilter: number[] = kindsParam
    ? kindsParam
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
    : [];

  // Parse relay filter (comma-separated URLs, optional)
  const relaysParam = searchParams.get("relays");
  const relayFilter: string[] = relaysParam
    ? relaysParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Build filter SQL clauses + params
  const kindClause =
    kindFilter.length > 0
      ? `AND kind IN (${kindFilter.map(() => "?").join(", ")})`
      : "";
  const kindParams = kindFilter.length > 0 ? kindFilter : [];

  const relayClause =
    relayFilter.length > 0
      ? `AND eventId IN (SELECT eventId FROM EventSource WHERE relay IN (${relayFilter.map(() => "?").join(", ")}))`
      : "";
  const relayParams = relayFilter.length > 0 ? relayFilter : [];

  // Combined filter params (kind first, then relay — matches clause order)
  const filterParams = [...kindParams, ...relayParams];

  // Build relay timeline filter clauses (operates on EventSource + NostrEvent join)
  const tlKindClause =
    kindFilter.length > 0
      ? `AND ne.kind IN (${kindFilter.map(() => "?").join(", ")})`
      : "";
  const tlRelayClause =
    relayFilter.length > 0
      ? `AND es.relay IN (${relayFilter.map(() => "?").join(", ")})`
      : "";
  const tlFilterParams = [...kindParams, ...relayParams];

  // Pre-computed lookups + filter-dependent live queries in parallel
  const [tzEstimate, pubkeyStats, heatmapRows, boundaryRows, relayTimelineRows] =
    await Promise.all([
      prisma.timezoneEstimate.findUnique({ where: { pubkeyHex: pubkey } }),
      prisma.pubkeyStats.findUnique({ where: { pubkeyHex: pubkey } }),

      // Heatmap: count by day-of-week x hour (with tz offset + filters)
      prisma.$queryRawUnsafe<HeatmapRow[]>(
        `SELECT
          CAST(strftime('%w', datetime(createdAt, 'unixepoch', ?)) AS INTEGER) AS dow,
          CAST(strftime('%H', datetime(createdAt, 'unixepoch', ?)) AS INTEGER) AS hour,
          COUNT(*) AS cnt
        FROM NostrEvent
        WHERE pubkeyHex = ? ${kindClause} ${relayClause}
        GROUP BY dow, hour`,
        tzMod,
        tzMod,
        pubkey,
        ...filterParams
      ),

      // Daily first/last event minute-of-day (with tz offset + filters)
      // Day boundary shifted by -5 hours: "day" starts at 5 AM local time.
      // Late-night events (midnight–5 AM) belong to the previous day.
      prisma.$queryRawUnsafe<BoundaryRow[]>(
        `SELECT
          date(createdAt, 'unixepoch', ?, '-5 hours') AS d,
          MIN(CAST(strftime('%H', datetime(createdAt, 'unixepoch', ?)) AS INTEGER) * 60
            + CAST(strftime('%M', datetime(createdAt, 'unixepoch', ?)) AS INTEGER)) AS firstMinute,
          MAX(CAST(strftime('%H', datetime(createdAt, 'unixepoch', ?)) AS INTEGER) * 60
            + CAST(strftime('%M', datetime(createdAt, 'unixepoch', ?)) AS INTEGER)) AS lastMinute
        FROM NostrEvent
        WHERE pubkeyHex = ? ${kindClause} ${relayClause}
        GROUP BY d
        ORDER BY d`,
        tzMod,
        tzMod,
        tzMod,
        tzMod,
        tzMod,
        pubkey,
        ...filterParams
      ),

      // Relay timeline: events per relay per month (by event authored time)
      prisma.$queryRawUnsafe<RelayTimelineRow[]>(
        `SELECT
          es.relay,
          strftime('%Y-%m', datetime(ne.createdAt, 'unixepoch')) AS month,
          COUNT(*) AS cnt
        FROM EventSource es
        JOIN NostrEvent ne ON ne.eventId = es.eventId
        WHERE ne.pubkeyHex = ? ${tlKindClause} ${tlRelayClause}
        GROUP BY es.relay, month
        ORDER BY month ASC, es.relay`,
        pubkey,
        ...tlFilterParams
      ),
    ]);

  const suggestedTimezoneOffset = tzEstimate?.estimatedUtcOffset ?? 0;
  const timezoneConfidence = (tzEstimate?.confidence as "low" | "medium" | "high") ?? null;
  const timezoneFlagged = tzEstimate?.flaggedUnreliable ?? false;

  const heatmap: HeatmapCell[] = heatmapRows.map((r: HeatmapRow) => ({
    dayOfWeek: Number(r.dow),
    hour: Number(r.hour),
    count: Number(r.cnt),
  }));

  // Kind + relay distribution from pre-computed PubkeyStats
  const kindDistribution = pubkeyStats
    ? JSON.parse(pubkeyStats.kindDistribution)
    : [];
  const relayDistribution = pubkeyStats
    ? JSON.parse(pubkeyStats.relayDistribution)
    : [];

  const dailyBoundaries: DailyBoundary[] = boundaryRows.map((r: BoundaryRow) => ({
    date: r.d,
    firstHour: Number(r.firstMinute) / 60,
    lastHour: Number(r.lastMinute) / 60,
  }));

  // DM analytics from pre-computed distribution
  let dmAnalytics: DmAnalytics | null = null;
  if (pubkeyStats?.dmActivityDistribution) {
    try {
      const hourlyDistribution: DmHourlyActivity[] = JSON.parse(
        pubkeyStats.dmActivityDistribution
      );
      const totalDmCount = hourlyDistribution.reduce((s, b) => s + b.count, 0);
      if (totalDmCount > 0) {
        const sorted = [...hourlyDistribution].sort((a, b) => b.count - a.count);
        const peakHours = sorted.slice(0, 3).map((h) => h.hour);
        const totalEvents = pubkeyStats.totalEvents || 1;
        const responsivenessScore = Math.round((totalDmCount / totalEvents) * 1000) / 1000;
        dmAnalytics = { hourlyDistribution, peakHours, totalDmCount, responsivenessScore };
      }
    } catch {
      // invalid JSON, leave null
    }
  }

  // NIP-65 relay list from pre-computed stats
  let nip65Relays: Nip65Relay[] = [];
  if (pubkeyStats?.nip65Relays) {
    try {
      nip65Relays = JSON.parse(pubkeyStats.nip65Relays);
    } catch {
      // invalid JSON, leave empty
    }
  }

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

  const relayTimeline: RelayMonthCount[] = relayTimelineRows.map((r) => ({
    relay: r.relay,
    month: r.month,
    count: Number(r.cnt),
  }));

  const data: AnalyticsData = {
    heatmap,
    kindDistribution,
    relayDistribution,
    dailyBoundaries,
    totalEvents: pubkeyStats?.totalEvents ?? 0,
    dateRange: {
      earliest: pubkeyStats?.earliestEvent ?? 0,
      latest: pubkeyStats?.latestEvent ?? 0,
    },
    suggestedTimezoneOffset,
    timezoneConfidence,
    timezoneFlagged,
    dmAnalytics,
    relayTimeline,
    nip65Relays,
    relayHealth,
    timezoneTimeline,
  };

  return NextResponse.json(data);
}
