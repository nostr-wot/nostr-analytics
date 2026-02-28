import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { HeatmapCell, DailyBoundary, AnalyticsData } from "@/lib/types";

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

  // Pre-computed lookups + filter-dependent live queries in parallel
  const [tzEstimate, pubkeyStats, heatmapRows, boundaryRows] =
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
      prisma.$queryRawUnsafe<BoundaryRow[]>(
        `SELECT
          date(createdAt, 'unixepoch', ?) AS d,
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
  };

  return NextResponse.json(data);
}
