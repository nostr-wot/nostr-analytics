import { prisma } from "@/lib/db";
import { analyzeRelayHealth } from "@/lib/relay-health-analyzer";
import { computeTimezoneTimeline } from "@/lib/timezone-estimator";
import type { Nip65Relay, RelayCount } from "@/lib/types";

interface KindRow {
  kind: number;
  _count: { kind: number };
}

interface RelayRow {
  relay: string;
  cnt: number | bigint;
}

interface StatsRow {
  cnt: number | bigint;
  minCreatedAt: number | null;
  maxCreatedAt: number | null;
}

interface DmHourRow {
  hour: number;
  cnt: number | bigint;
}

interface Nip65RelayRow {
  relay: string;
  cnt: number | bigint;
}

interface RelayHealthRow {
  relay: string;
  status: string;
}

interface UptimeRow {
  relay: string;
  total: number | bigint;
  ok: number | bigint;
}

interface CountRow {
  relay: string;
  cnt: number | bigint;
}

export async function recomputeStatsForPubkey(pubkeyHex: string): Promise<void> {
  const [eventCount, cacheCount, kind0] = await Promise.all([
    prisma.nostrEvent.count({ where: { pubkeyHex } }),
    prisma.cacheResponse.count({ where: { pubkeyHex } }),
    prisma.nostrEvent.findFirst({
      where: { pubkeyHex, kind: 0 },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    }),
  ]);

  let cachedProfile: string | null = null;
  if (kind0) {
    try {
      JSON.parse(kind0.content); // validate JSON
      cachedProfile = kind0.content;
    } catch {
      // invalid JSON
    }
  }

  // Update TrackedNpub counter columns
  await prisma.trackedNpub.update({
    where: { pubkeyHex },
    data: {
      cachedEventCount: eventCount,
      cachedCacheCount: cacheCount,
      cachedProfile,
      statsComputedAt: new Date(),
    },
  });

  // Compute kind + relay distributions and date range for PubkeyStats
  const [kindRows, relayRows, statsRows, dmHourRows] = await Promise.all([
    prisma.nostrEvent.groupBy({
      by: ["kind"],
      where: { pubkeyHex },
      _count: { kind: true },
      orderBy: { _count: { kind: "desc" } },
    }) as unknown as Promise<KindRow[]>,

    prisma.$queryRawUnsafe<RelayRow[]>(
      `SELECT es.relay, COUNT(DISTINCT es.eventId) AS cnt
      FROM EventSource es
      JOIN NostrEvent ne ON ne.eventId = es.eventId
      WHERE ne.pubkeyHex = ?
      GROUP BY es.relay
      ORDER BY cnt DESC`,
      pubkeyHex
    ),

    prisma.$queryRawUnsafe<StatsRow[]>(
      `SELECT COUNT(*) AS cnt, MIN(createdAt) AS minCreatedAt, MAX(createdAt) AS maxCreatedAt
      FROM NostrEvent WHERE pubkeyHex = ?`,
      pubkeyHex
    ),

    prisma.$queryRawUnsafe<DmHourRow[]>(
      `SELECT CAST(strftime('%H', datetime(createdAt, 'unixepoch')) AS INTEGER) AS hour,
              COUNT(*) AS cnt
       FROM NostrEvent
       WHERE pubkeyHex = ? AND kind IN (4, 1059)
       GROUP BY hour ORDER BY hour`,
      pubkeyHex
    ),
  ]);

  const kindDistribution = kindRows.map((k: KindRow) => ({
    kind: k.kind,
    count: Number(k._count.kind),
  }));

  const relayDistribution = relayRows.map((r: RelayRow) => ({
    relay: r.relay,
    count: Number(r.cnt),
  }));

  // Build full 24-bin DM activity distribution
  const dmBins = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  for (const row of dmHourRows) {
    dmBins[Number(row.hour)].count = Number(row.cnt);
  }
  const dmTotal = dmBins.reduce((s, b) => s + b.count, 0);
  const dmActivityDistribution = dmTotal > 0 ? JSON.stringify(dmBins) : null;

  const stats = statsRows[0];
  const totalEvents = Number(stats?.cnt ?? 0);

  // Compute NIP-65 relay list with markers, health, and event percentages
  let nip65Relays: string | null = null;
  let relayHealthScore: string | null = null;
  const nip65Row = await prisma.$queryRawUnsafe<{ tags: string }[]>(
    `SELECT tags FROM NostrEvent
     WHERE pubkeyHex = ? AND kind = 10002
     ORDER BY createdAt DESC LIMIT 1`,
    pubkeyHex
  );

  if (nip65Row.length > 0) {
    try {
      const tags: string[][] = JSON.parse(nip65Row[0].tags);
      const relayTags = tags.filter((t) => t[0] === "r" && t[1]);
      if (relayTags.length > 0) {
        const relayUrls = relayTags.map((t) => t[1]);
        const placeholders = relayUrls.map(() => "?").join(", ");

        // Batch query: events per NIP-65 relay for this pubkey
        const [eventCountRows, healthRows] = await Promise.all([
          prisma.$queryRawUnsafe<Nip65RelayRow[]>(
            `SELECT es.relay, COUNT(DISTINCT es.eventId) AS cnt
             FROM EventSource es
             JOIN NostrEvent ne ON ne.eventId = es.eventId
             WHERE ne.pubkeyHex = ? AND es.relay IN (${placeholders})
             GROUP BY es.relay`,
            pubkeyHex,
            ...relayUrls
          ),
          prisma.$queryRawUnsafe<RelayHealthRow[]>(
            `SELECT relay, status
             FROM RelayCheck
             WHERE relay IN (${placeholders})
               AND checkedAt >= datetime('now', '-24 hours')
             ORDER BY checkedAt DESC`,
            ...relayUrls
          ),
        ]);

        const eventCountMap = new Map(
          eventCountRows.map((r) => [r.relay, Number(r.cnt)])
        );
        // Pick latest check per relay (first seen in DESC order)
        const healthMap = new Map<string, string>();
        for (const r of healthRows) {
          if (!healthMap.has(r.relay)) healthMap.set(r.relay, r.status);
        }

        const nip65List = relayTags.map((t) => {
          const url = t[1];
          const marker = t[2] === "read" ? "read" : t[2] === "write" ? "write" : "both";
          const relayEvents = eventCountMap.get(url) ?? 0;
          let health: string;
          if (relayEvents > 0) {
            health = "active";
          } else if (healthMap.has(url)) {
            health = healthMap.get(url) === "ok" ? "reachable" : "unreachable";
          } else {
            health = "unknown";
          }
          const eventPercent = totalEvents > 0
            ? Math.round((relayEvents / totalEvents) * 1000) / 10
            : 0;
          return { url, marker, health, eventPercent };
        });

        nip65Relays = JSON.stringify(nip65List);

        // Compute relay health report
        const relayHealthReport = analyzeRelayHealth(
          nip65List as Nip65Relay[],
          relayDistribution as RelayCount[],
          totalEvents,
        );
        relayHealthScore = JSON.stringify(relayHealthReport);
      }
    } catch {
      // invalid JSON, leave null
    }
  }

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

  await prisma.pubkeyStats.upsert({
    where: { pubkeyHex },
    create: {
      pubkeyHex,
      kindDistribution: JSON.stringify(kindDistribution),
      relayDistribution: JSON.stringify(relayDistribution),
      dmActivityDistribution,
      nip65Relays,
      relayHealthScore,
      timezoneTimeline,
      totalEvents,
      earliestEvent: stats?.minCreatedAt ?? 0,
      latestEvent: stats?.maxCreatedAt ?? 0,
    },
    update: {
      kindDistribution: JSON.stringify(kindDistribution),
      relayDistribution: JSON.stringify(relayDistribution),
      dmActivityDistribution,
      nip65Relays,
      relayHealthScore,
      timezoneTimeline,
      totalEvents,
      earliestEvent: stats?.minCreatedAt ?? 0,
      latestEvent: stats?.maxCreatedAt ?? 0,
      computedAt: new Date(),
    },
  });

  console.log(`[stats] Recomputed stats for ${pubkeyHex.slice(0, 8)}`);
}

export async function runStatsComputation(): Promise<void> {
  const trackedUsers = await prisma.trackedNpub.findMany({
    select: { pubkeyHex: true },
  });

  // -- Per-npub stats --
  for (const { pubkeyHex } of trackedUsers) {
    await recomputeStatsForPubkey(pubkeyHex);
  }

  // -- Relay snapshots --
  const relays = await prisma.relay.findMany({ select: { url: true } });
  const relayUrls = relays.map((r: { url: string }) => r.url);

  if (relayUrls.length > 0) {
    const placeholders = relayUrls.map(() => "?").join(", ");

    const [uptime24hRows, uptime7dRows, eventCountRows] = await Promise.all([
      prisma.$queryRawUnsafe<UptimeRow[]>(
        `SELECT relay, COUNT(*) AS total, SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok
        FROM RelayCheck
        WHERE relay IN (${placeholders})
          AND checkedAt >= datetime('now', '-24 hours')
        GROUP BY relay`,
        ...relayUrls
      ),

      prisma.$queryRawUnsafe<UptimeRow[]>(
        `SELECT relay, COUNT(*) AS total, SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok
        FROM RelayCheck
        WHERE relay IN (${placeholders})
          AND checkedAt >= datetime('now', '-7 days')
        GROUP BY relay`,
        ...relayUrls
      ),

      prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT relay, COUNT(*) AS cnt
        FROM EventSource
        WHERE relay IN (${placeholders})
        GROUP BY relay`,
        ...relayUrls
      ),
    ]);

    const uptime24hMap = new Map(
      uptime24hRows.map((r: UptimeRow) => [
        r.relay,
        Number(r.total) > 0
          ? Math.round((Number(r.ok) / Number(r.total)) * 10000) / 100
          : null,
      ])
    );
    const uptime7dMap = new Map(
      uptime7dRows.map((r: UptimeRow) => [
        r.relay,
        Number(r.total) > 0
          ? Math.round((Number(r.ok) / Number(r.total)) * 10000) / 100
          : null,
      ])
    );
    const eventCountMap = new Map(
      eventCountRows.map((r: CountRow) => [r.relay, Number(r.cnt)])
    );

    for (const url of relayUrls) {
      await prisma.relaySnapshot.upsert({
        where: { relay: url },
        create: {
          relay: url,
          uptime24h: uptime24hMap.get(url) ?? null,
          uptime7d: uptime7dMap.get(url) ?? null,
          eventCount: eventCountMap.get(url) ?? 0,
        },
        update: {
          uptime24h: uptime24hMap.get(url) ?? null,
          uptime7d: uptime7dMap.get(url) ?? null,
          eventCount: eventCountMap.get(url) ?? 0,
          computedAt: new Date(),
        },
      });
    }
  }

  // -- Global stats --
  const [totalEvents, totalCacheResponses] = await Promise.all([
    prisma.nostrEvent.count(),
    prisma.cacheResponse.count(),
  ]);

  await prisma.globalStats.upsert({
    where: { id: 1 },
    create: { totalEvents, totalCacheResponses },
    update: { totalEvents, totalCacheResponses, computedAt: new Date() },
  });

  console.log(
    `[stats] Computed: ${trackedUsers.length} npubs, ${relayUrls.length} relays, global totals (${totalEvents} events, ${totalCacheResponses} cache)`
  );
}
