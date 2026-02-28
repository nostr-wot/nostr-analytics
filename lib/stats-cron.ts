import { prisma } from "@/lib/db";

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

interface UptimeRow {
  relay: string;
  total: number | bigint;
  ok: number | bigint;
}

interface CountRow {
  relay: string;
  cnt: number | bigint;
}

export async function runStatsComputation(): Promise<void> {
  const trackedUsers = await prisma.trackedNpub.findMany({
    select: { pubkeyHex: true },
  });

  // -- Per-npub stats --
  for (const { pubkeyHex } of trackedUsers) {
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
    const [kindRows, relayRows, statsRows] = await Promise.all([
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
    ]);

    const kindDistribution = kindRows.map((k: KindRow) => ({
      kind: k.kind,
      count: Number(k._count.kind),
    }));

    const relayDistribution = relayRows.map((r: RelayRow) => ({
      relay: r.relay,
      count: Number(r.cnt),
    }));

    const stats = statsRows[0];

    await prisma.pubkeyStats.upsert({
      where: { pubkeyHex },
      create: {
        pubkeyHex,
        kindDistribution: JSON.stringify(kindDistribution),
        relayDistribution: JSON.stringify(relayDistribution),
        totalEvents: Number(stats?.cnt ?? 0),
        earliestEvent: stats?.minCreatedAt ?? 0,
        latestEvent: stats?.maxCreatedAt ?? 0,
      },
      update: {
        kindDistribution: JSON.stringify(kindDistribution),
        relayDistribution: JSON.stringify(relayDistribution),
        totalEvents: Number(stats?.cnt ?? 0),
        earliestEvent: stats?.minCreatedAt ?? 0,
        latestEvent: stats?.maxCreatedAt ?? 0,
        computedAt: new Date(),
      },
    });
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
