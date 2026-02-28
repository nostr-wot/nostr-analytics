# Pre-Computed Statistics Design

## Problem

Several API endpoints run expensive aggregation queries on every request:

- **`/api/npubs`**: N+3 queries (event count, cache count, profile lookup per tracked npub)
- **`/api/events/analytics`**: `GROUP BY kind` and `JOIN + GROUP BY relay` for unfiltered menu data
- **`/api/relays`**: 3 aggregation queries for 24h/7d uptime percentages
- **`/api/collector`**: 2 full-table `COUNT(*)` scans

All of this data only changes when new events are collected (every ~10 minutes). Computing it on every request is wasteful.

## Solution

Materialize aggregations into pre-computed tables/columns, updated after each collection cycle in the scheduler.

## Changes

### Schema

#### Counter columns on `TrackedNpub`

```prisma
cachedEventCount   Int      @default(0)
cachedCacheCount   Int      @default(0)
cachedProfile      String?  // JSON: NostrProfile
statsComputedAt    DateTime?
```

#### New model: `PubkeyStats`

Per-pubkey kind/relay distributions and date range (unfiltered menu data for analytics).

```prisma
model PubkeyStats {
  id                Int      @id @default(autoincrement())
  pubkeyHex         String   @unique
  kindDistribution  String   // JSON: [{kind: number, count: number}]
  relayDistribution String   // JSON: [{relay: string, count: number}]
  totalEvents       Int
  earliestEvent     Int
  latestEvent       Int
  computedAt        DateTime @default(now())
}
```

#### New model: `RelaySnapshot`

Pre-computed uptime percentages and event counts.

```prisma
model RelaySnapshot {
  id         Int      @id @default(autoincrement())
  relay      String   @unique
  uptime24h  Float?
  uptime7d   Float?
  eventCount Int      @default(0)
  computedAt DateTime @default(now())
}
```

#### New model: `GlobalStats`

Singleton row avoiding full-table count scans.

```prisma
model GlobalStats {
  id                  Int      @id @default(1)
  totalEvents         Int      @default(0)
  totalCacheResponses Int      @default(0)
  computedAt          DateTime @default(now())
}
```

### Computation Engine: `lib/stats-cron.ts`

Single `runStatsComputation()` function that:

1. For each tracked npub:
   - Count events, count cache responses, find latest kind=0 profile
   - Update `TrackedNpub` counter columns
   - Compute kind distribution (`GROUP BY kind`) and relay distribution (`JOIN + GROUP BY relay`)
   - Compute total events + date range
   - Upsert `PubkeyStats`

2. For each relay:
   - Compute 24h and 7d uptime percentages
   - Count events from EventSource
   - Upsert `RelaySnapshot`

3. Global stats:
   - Count total events and cache responses
   - Upsert `GlobalStats` (id=1)

### Scheduler Integration

In `scripts/scheduler-worker.ts`:

```typescript
async function runCycle() {
  await runCollectionCycle().catch(console.error);
  await runTimezoneEstimation().catch(console.error);
  await runStatsComputation().catch(console.error);
}
```

### API Endpoint Changes

#### `/api/npubs` (route.ts)
- Remove per-npub count queries and profile lookup
- Read `cachedEventCount`, `cachedCacheCount`, `cachedProfile` from `TrackedNpub` directly

#### `/api/events/analytics` (route.ts)
- Remove kind distribution `groupBy` query
- Remove relay distribution raw SQL query
- Remove stats (totalEvents, dateRange) raw SQL query
- Read all from `PubkeyStats` table lookup
- Keep heatmap and daily boundaries as live queries (they depend on tz offset + filters)

#### `/api/relays` (route.ts)
- Remove 24h/7d uptime aggregation queries
- Read `uptime24h`, `uptime7d`, `eventCount` from `RelaySnapshot`
- Keep per-relay check history as live query (compact array, already optimized)

#### `/api/collector` (route.ts)
- Remove `count()` queries on NostrEvent and CacheResponse
- Read from `GlobalStats` singleton

## Impact

| Endpoint | Before | After |
|----------|--------|-------|
| `/api/npubs` (50 users) | 151 queries | 1 query |
| `/api/events/analytics` | 5 parallel queries | 2 queries (heatmap + boundaries) + 1 lookup |
| `/api/relays` (19 relays) | 19 + 3 aggregation queries | 19 + 1 lookup |
| `/api/collector` | 2 full-table scans | 1 row read |
