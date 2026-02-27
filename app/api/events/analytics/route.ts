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

interface StatsRow {
  cnt: number | bigint;
  minCreatedAt: number | null;
  maxCreatedAt: number | null;
}

interface RelayRow {
  relay: string;
  cnt: number | bigint;
}

function buildTzModifier(offset: number): string {
  const sign = offset >= 0 ? "+" : "-";
  return `${sign}${Math.abs(offset)} hours`;
}

function computeSuggestedOffset(boundaryRows: BoundaryRow[]): number {
  if (boundaryRows.length === 0) return 0;
  const firstHours = boundaryRows.map((r) => Number(r.firstMinute) / 60);
  firstHours.sort((a, b) => a - b);
  const median = firstHours[Math.floor(firstHours.length / 2)];
  const offset = Math.round(8 - median);
  return Math.max(-12, Math.min(14, offset));
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

  // First, get UTC boundary rows for timezone guess (always unfiltered, UTC)
  const utcBoundaryRows = await prisma.$queryRawUnsafe<BoundaryRow[]>(
    `SELECT
      date(createdAt, 'unixepoch') AS d,
      MIN(CAST(strftime('%H', datetime(createdAt, 'unixepoch')) AS INTEGER) * 60
        + CAST(strftime('%M', datetime(createdAt, 'unixepoch')) AS INTEGER)) AS firstMinute,
      MAX(CAST(strftime('%H', datetime(createdAt, 'unixepoch')) AS INTEGER) * 60
        + CAST(strftime('%M', datetime(createdAt, 'unixepoch')) AS INTEGER)) AS lastMinute
    FROM NostrEvent
    WHERE pubkeyHex = ?
    GROUP BY d
    ORDER BY d`,
    pubkey
  );

  const suggestedTimezoneOffset = computeSuggestedOffset(utcBoundaryRows);

  const [heatmapRows, kindRows, relayRows, boundaryRows, statsRows] =
    await Promise.all([
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

      // Kind distribution — always unfiltered (acts as menu for kind pills)
      prisma.nostrEvent.groupBy({
        by: ["kind"],
        where: { pubkeyHex: pubkey },
        _count: { kind: true },
        orderBy: { _count: { kind: "desc" } },
      }),

      // Relay distribution — always unfiltered (acts as menu for relay pills)
      prisma.$queryRawUnsafe<RelayRow[]>(
        `SELECT es.relay, COUNT(DISTINCT es.eventId) AS cnt
        FROM EventSource es
        JOIN NostrEvent ne ON ne.eventId = es.eventId
        WHERE ne.pubkeyHex = ?
        GROUP BY es.relay
        ORDER BY cnt DESC`,
        pubkey
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

      // Total count + date range (with filters)
      prisma.$queryRawUnsafe<StatsRow[]>(
        `SELECT
          COUNT(*) AS cnt,
          MIN(createdAt) AS minCreatedAt,
          MAX(createdAt) AS maxCreatedAt
        FROM NostrEvent
        WHERE pubkeyHex = ? ${kindClause} ${relayClause}`,
        pubkey,
        ...filterParams
      ),
    ]);

  const heatmap: HeatmapCell[] = heatmapRows.map((r) => ({
    dayOfWeek: Number(r.dow),
    hour: Number(r.hour),
    count: Number(r.cnt),
  }));

  const kindDistribution = kindRows.map((k) => ({
    kind: k.kind,
    count: Number(k._count.kind),
  }));

  const relayDistribution = relayRows.map((r) => ({
    relay: r.relay,
    count: Number(r.cnt),
  }));

  const dailyBoundaries: DailyBoundary[] = boundaryRows.map((r) => ({
    date: r.d,
    firstHour: Number(r.firstMinute) / 60,
    lastHour: Number(r.lastMinute) / 60,
  }));

  const statsRow = statsRows[0];

  const data: AnalyticsData = {
    heatmap,
    kindDistribution,
    relayDistribution,
    dailyBoundaries,
    totalEvents: Number(statsRow?.cnt ?? 0),
    dateRange: {
      earliest: statsRow?.minCreatedAt ?? 0,
      latest: statsRow?.maxCreatedAt ?? 0,
    },
    suggestedTimezoneOffset,
  };

  return NextResponse.json(data);
}
