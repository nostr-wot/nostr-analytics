import { prisma } from "./db";
import {
  sendCacheRequest,
  sendRelayRequest,
  waitForEose,
} from "./websocket";
import {
  CACHE_URL,
  RELAY_URLS,
  CACHE_QUERIES,
  RELAY_KINDS,
  RELAY_FETCH_LIMIT,
  EOSE_TIMEOUT_RELAY,
  FETCH_CONCURRENCY,
} from "./constants";
import type { NostrEventWire } from "./types";
import { sanitizeContent } from "./content-filter";
import { RelayPool } from "./relay-pool";
import { saveRelayHealth } from "./relay-health";

// ── Batch DB inserts ────────────────────────────────────────────────

const BATCH_SIZE = 100;

async function storeNostrEventsBatch(
  events: NostrEventWire[],
  source: string
): Promise<number> {
  if (events.length === 0) return 0;

  let inserted = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: (string | number)[] = [];

    for (const event of batch) {
      placeholders.push("(?, ?, ?, ?, ?, ?, ?, ?)");
      values.push(
        event.id,
        event.pubkey,
        event.kind,
        sanitizeContent(event.kind, event.content),
        JSON.stringify(event.tags),
        event.sig,
        event.created_at,
        source
      );
    }

    const sql = `INSERT OR IGNORE INTO NostrEvent (eventId, pubkeyHex, kind, content, tags, sig, createdAt, source) VALUES ${placeholders.join(", ")}`;

    const result = await prisma.$executeRawUnsafe(sql, ...values);
    inserted += result;

    // Record relay source for ALL events (even duplicates)
    const srcPlaceholders: string[] = [];
    const srcValues: string[] = [];
    for (const event of batch) {
      srcPlaceholders.push("(?, ?)");
      srcValues.push(event.id, source);
    }
    const srcSql = `INSERT OR IGNORE INTO EventSource (eventId, relay) VALUES ${srcPlaceholders.join(", ")}`;
    await prisma.$executeRawUnsafe(srcSql, ...srcValues);
  }

  return inserted;
}

// ── Cache storage (unchanged — needs upsert semantics) ──────────────

async function storeCacheResponse(
  pubkeyHex: string,
  queryType: string,
  kind: number,
  content: unknown
): Promise<void> {
  const newContent = JSON.stringify(content);

  const existing = await prisma.cacheResponse.findUnique({
    where: {
      pubkeyHex_queryType_responseKind: { pubkeyHex, queryType, responseKind: kind },
    },
    select: { content: true },
  });

  if (existing && existing.content !== newContent) {
    await prisma.cacheResponseLog.create({
      data: {
        pubkeyHex,
        queryType,
        responseKind: kind,
        content: existing.content,
      },
    });
  }

  await prisma.cacheResponse.upsert({
    where: {
      pubkeyHex_queryType_responseKind: {
        pubkeyHex,
        queryType,
        responseKind: kind,
      },
    },
    update: {
      content: newContent,
    },
    create: {
      pubkeyHex,
      queryType,
      responseKind: kind,
      content: newContent,
    },
  });
}

// ── Cache fetch (pipelined queries, pooled connection) ───────────────

async function fetchFromCache(
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{
  newEvents: number;
  newCacheResponses: number;
}> {
  let newEvents = 0;
  let newCacheResponses = 0;
  const usePool = !!pool;

  let ws;
  try {
    ws = usePool ? await pool!.get(CACHE_URL) : (await import("./websocket").then(m => m.connectWebSocket(CACHE_URL)));
  } catch (err) {
    console.error(`[collector] Failed to connect to cache server:`, err);
    return { newEvents, newCacheResponses };
  }

  try {
    const suffix = `${pubkeyHex.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Send all REQ messages immediately
    const subIds = CACHE_QUERIES.map((query) => {
      const subId = `${query.name}_${suffix}`;
      sendCacheRequest(ws!, subId, query.message, query.buildPayload(pubkeyHex));
      return subId;
    });

    // Wait for all EOSE responses in parallel
    const results = await Promise.all(
      subIds.map((subId) => waitForEose(ws!, subId))
    );

    // Process results
    for (let i = 0; i < CACHE_QUERIES.length; i++) {
      const query = CACHE_QUERIES[i];
      const { events, cacheResponses } = results[i];

      const stored = await storeNostrEventsBatch(events, CACHE_URL);
      newEvents += stored;

      for (const cr of cacheResponses) {
        await storeCacheResponse(pubkeyHex, query.name, cr.kind, cr.content);
        newCacheResponses++;
      }
    }
  } finally {
    if (!usePool) ws.close();
  }

  return { newEvents, newCacheResponses };
}

// ── NIP-65 outbox relay discovery ─────────────────────────────────────

async function getOutboxRelays(pubkeyHex: string): Promise<string[]> {
  const row = await prisma.$queryRawUnsafe<{ tags: string }[]>(
    `SELECT tags FROM NostrEvent
     WHERE pubkeyHex = ? AND kind = 10002
     ORDER BY createdAt DESC LIMIT 1`,
    pubkeyHex
  );
  if (row.length === 0) return [];
  try {
    const tags: string[][] = JSON.parse(row[0].tags);
    return tags
      .filter(
        (t) => t[0] === "r" && t[1] && (t.length === 2 || t[2] === "write")
      )
      .map((t) => t[1]);
  } catch {
    return [];
  }
}

// ── Relay fetch (with optional connection pool) ─────────────────────

async function fetchFromSingleRelay(
  relayUrl: string,
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{ newEvents: number }> {
  let totalNewEvents = 0;
  const usePool = !!pool;
  const tag = `${pubkeyHex.slice(0, 8)} ${new URL(relayUrl).hostname}`;
  const throttler = pool?.throttler;

  let ws;
  try {
    ws = usePool ? await pool!.get(relayUrl) : (await import("./websocket").then(m => m.connectWebSocket(relayUrl)));
  } catch (err) {
    console.error(`[collector] Failed to connect to ${relayUrl}:`, err);
    return { newEvents: 0 };
  }

  try {
    let until: number | undefined;
    let page = 0;

    while (true) {
      page++;
      const subId = `relay_${pubkeyHex.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const filter: Record<string, unknown> = {
        authors: [pubkeyHex],
        kinds: RELAY_KINDS,
        limit: RELAY_FETCH_LIMIT,
      };
      if (until !== undefined) {
        filter.until = until;
      }

      // Throttle: wait for per-relay delay before sending
      if (throttler) await throttler.acquire(relayUrl);

      sendRelayRequest(ws, subId, filter);
      const { events, rateLimited } = await waitForEose(ws, subId, EOSE_TIMEOUT_RELAY);

      // Report throttle outcome
      if (rateLimited && throttler) {
        throttler.reportRateLimit(relayUrl);
        console.log(`[collector] ${tag}: rate limited, stopping pagination`);
        break;
      } else if (throttler) {
        throttler.reportSuccess(relayUrl);
      }

      if (events.length === 0) break;

      const stored = await storeNostrEventsBatch(events, relayUrl);
      totalNewEvents += stored;

      // Log progress when paginating
      if (page > 1 || events.length === RELAY_FETCH_LIMIT) {
        console.log(
          `[collector] ${tag}: page ${page}, ${events.length} fetched, ${stored} new`
        );
      }

      // Got less than limit — no more pages
      if (events.length < RELAY_FETCH_LIMIT) break;

      // Full batch but all duplicates — we've already fetched beyond this point
      if (stored === 0) {
        console.log(`[collector] ${tag}: caught up (all duplicates), stopping`);
        break;
      }

      // Paginate backward: next page starts before the oldest event in this batch
      const oldest = Math.min(...events.map((e) => e.created_at));
      until = oldest - 1;
    }
  } finally {
    if (!usePool) ws.close();
  }

  return { newEvents: totalNewEvents };
}

async function fetchFromRelays(
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{ newEvents: number }> {
  // Filter out relays that are backed off
  const now = new Date();
  const relayStates = await prisma.relay.findMany({
    where: { url: { in: RELAY_URLS } },
    select: { url: true, backoffUntil: true },
  });
  const backoffMap = new Map(relayStates.map((r) => [r.url, r.backoffUntil]));

  const activeUrls: string[] = [];
  for (const url of RELAY_URLS) {
    const until = backoffMap.get(url);
    if (until && until > now) {
      const hhmm = until.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      console.log(`[collector] Skipping ${new URL(url).hostname} (backed off until ${hhmm})`);
    } else {
      activeUrls.push(url);
    }
  }

  const results = await Promise.all(
    activeUrls.map((url) => fetchFromSingleRelay(url, pubkeyHex, pool))
  );
  const newEvents = results.reduce((sum, r) => sum + r.newEvents, 0);
  return { newEvents };
}

// ── Outbox relay fetch (NIP-65 write relays) ─────────────────────────

async function fetchFromOutboxRelays(
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{ newEvents: number }> {
  const outboxUrls = await getOutboxRelays(pubkeyHex);
  if (outboxUrls.length === 0) return { newEvents: 0 };

  // Exclude relays already in RELAY_URLS (they're fetched by fetchFromRelays)
  const hardcodedSet = new Set(RELAY_URLS);
  const extraUrls = outboxUrls.filter((url) => !hardcodedSet.has(url));
  if (extraUrls.length === 0) return { newEvents: 0 };

  console.log(
    `[collector] ${pubkeyHex.slice(0, 8)}: fetching from ${extraUrls.length} extra outbox relay(s)`
  );

  const results = await Promise.all(
    extraUrls.map((url) => fetchFromSingleRelay(url, pubkeyHex, pool))
  );
  const newEvents = results.reduce((sum, r) => sum + r.newEvents, 0);
  return { newEvents };
}

// ── Public API ──────────────────────────────────────────────────────

export async function fetchAllForPubkey(
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{
  newEvents: number;
  newCacheResponses: number;
}> {
  console.log(`[collector] Fetching data for ${pubkeyHex.slice(0, 8)}...`);

  const [cacheResult, relayResult, outboxResult] = await Promise.all([
    fetchFromCache(pubkeyHex, pool),
    fetchFromRelays(pubkeyHex, pool),
    fetchFromOutboxRelays(pubkeyHex, pool),
  ]);

  const totalNewEvents = cacheResult.newEvents + relayResult.newEvents + outboxResult.newEvents;
  const totalCacheResponses = cacheResult.newCacheResponses;

  console.log(
    `[collector] ${pubkeyHex.slice(0, 8)}: ${totalNewEvents} new events, ${totalCacheResponses} cache responses`
  );

  await prisma.trackedNpub.update({
    where: { pubkeyHex },
    data: { lastFetchedAt: new Date() },
  });

  return { newEvents: totalNewEvents, newCacheResponses: totalCacheResponses };
}

// ── Kind 0 reload ───────────────────────────────────────────────────

export async function reloadKind0(
  pubkeyHex: string
): Promise<{ eventsFound: number; profile: Record<string, unknown> | null }> {
  console.log(`[collector] Reloading kind 0 for ${pubkeyHex.slice(0, 8)}...`);

  const { connectWebSocket } = await import("./websocket");
  let eventsFound = 0;
  const allKind0: NostrEventWire[] = [];

  // Fetch kind 0 from each relay (parallel, skip backed-off relays)
  const now = new Date();
  const relayStates = await prisma.relay.findMany({
    where: { url: { in: RELAY_URLS } },
    select: { url: true, backoffUntil: true },
  });
  const backoffMap = new Map(relayStates.map((r) => [r.url, r.backoffUntil]));
  const activeUrls = RELAY_URLS.filter((url) => {
    const until = backoffMap.get(url);
    return !until || until <= now;
  });

  const relayResults = await Promise.allSettled(
    activeUrls.map(async (relayUrl) => {
      let ws;
      try {
        ws = await connectWebSocket(relayUrl);
      } catch {
        return [];
      }
      try {
        const subId = `kind0_${pubkeyHex.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        sendRelayRequest(ws, subId, {
          authors: [pubkeyHex],
          kinds: [0],
          limit: 10,
        });
        const { events } = await waitForEose(ws, subId, EOSE_TIMEOUT_RELAY);
        if (events.length > 0) {
          await storeNostrEventsBatch(events, relayUrl);
        }
        return events;
      } finally {
        ws.close();
      }
    })
  );

  for (const result of relayResults) {
    if (result.status === "fulfilled") {
      eventsFound += result.value.length;
      allKind0.push(...result.value);
    }
  }

  // Also fetch from cache
  try {
    const ws = await connectWebSocket(CACHE_URL);
    try {
      const subId = `kind0_cache_${pubkeyHex.slice(0, 8)}_${Date.now()}`;
      sendCacheRequest(ws, subId, "user_profile", { pubkey: pubkeyHex });
      const { events } = await waitForEose(ws, subId);
      if (events.length > 0) {
        await storeNostrEventsBatch(events, CACHE_URL);
        eventsFound += events.length;
        allKind0.push(...events);
      }
    } finally {
      ws.close();
    }
  } catch {
    console.error(`[collector] Failed to fetch kind 0 from cache`);
  }

  // Pick the latest kind 0 and update cached profile
  let profile: Record<string, unknown> | null = null;
  if (allKind0.length > 0) {
    const latest = allKind0.reduce((a, b) =>
      a.created_at >= b.created_at ? a : b
    );
    try {
      profile = JSON.parse(latest.content);
      await prisma.trackedNpub.update({
        where: { pubkeyHex },
        data: { cachedProfile: latest.content },
      });
    } catch {
      // invalid JSON
    }
  }

  // Also check DB for an even newer kind 0 we already had
  const dbKind0 = await prisma.nostrEvent.findFirst({
    where: { pubkeyHex, kind: 0 },
    orderBy: { createdAt: "desc" },
    select: { content: true, createdAt: true },
  });
  if (dbKind0) {
    const bestFetched = allKind0.length > 0
      ? Math.max(...allKind0.map((e) => e.created_at))
      : 0;
    if (dbKind0.createdAt > bestFetched) {
      try {
        profile = JSON.parse(dbKind0.content);
        await prisma.trackedNpub.update({
          where: { pubkeyHex },
          data: { cachedProfile: dbKind0.content },
        });
      } catch {
        // invalid JSON
      }
    }
  }

  console.log(
    `[collector] Kind 0 reload for ${pubkeyHex.slice(0, 8)}: ${eventsFound} events found`
  );

  return { eventsFound, profile };
}

// ── Exhaustive single-relay fetch ───────────────────────────────────

export async function fetchFromSingleRelayExhaustive(
  relayUrl: string,
  pubkeyHex: string
): Promise<{ totalEvents: number; newEvents: number }> {
  const tag = `${pubkeyHex.slice(0, 8)} ${new URL(relayUrl).hostname}`;
  console.log(`[collector] Exhaustive recheck: ${tag}`);

  // Ensure relay exists in DB (for custom URLs)
  await prisma.relay.upsert({
    where: { url: relayUrl },
    create: { url: relayUrl },
    update: {},
  });

  const { connectWebSocket } = await import("./websocket");

  let ws;
  try {
    ws = await connectWebSocket(relayUrl);
  } catch (err) {
    console.error(`[collector] Failed to connect to ${relayUrl}:`, err);
    return { totalEvents: 0, newEvents: 0 };
  }

  let totalEvents = 0;
  let totalNewEvents = 0;

  try {
    let until: number | undefined;
    let page = 0;
    let consecutiveRateLimits = 0;
    const MAX_RATE_LIMIT_RETRIES = 5;

    while (true) {
      page++;
      const subId = `exhaust_${pubkeyHex.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const filter: Record<string, unknown> = {
        authors: [pubkeyHex],
        kinds: RELAY_KINDS,
        limit: RELAY_FETCH_LIMIT,
      };
      if (until !== undefined) {
        filter.until = until;
      }

      sendRelayRequest(ws, subId, filter);
      const { events, rateLimited } = await waitForEose(ws, subId, EOSE_TIMEOUT_RELAY);

      if (rateLimited) {
        consecutiveRateLimits++;
        if (consecutiveRateLimits > MAX_RATE_LIMIT_RETRIES) {
          console.log(`[collector] ${tag}: max rate limit retries reached, stopping`);
          break;
        }
        const waitMs = Math.min(30_000 * Math.pow(2, consecutiveRateLimits - 1), 300_000);
        console.log(
          `[collector] ${tag}: rate limited (attempt ${consecutiveRateLimits}/${MAX_RATE_LIMIT_RETRIES}), waiting ${Math.round(waitMs / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        // Reconnect in case the connection was dropped
        try { ws.close(); } catch { /* ignore */ }
        try {
          ws = await connectWebSocket(relayUrl);
        } catch (err) {
          console.error(`[collector] ${tag}: reconnect failed:`, err);
          break;
        }

        page--; // Retry the same page
        continue;
      }

      consecutiveRateLimits = 0;

      if (events.length === 0) {
        console.log(`[collector] ${tag}: relay returned 0 events, done (page ${page})`);
        break;
      }

      totalEvents += events.length;
      const stored = await storeNostrEventsBatch(events, relayUrl);
      totalNewEvents += stored;

      console.log(
        `[collector] ${tag}: page ${page}, ${events.length} fetched, ${stored} new, ${totalEvents} total`
      );

      if (events.length < RELAY_FETCH_LIMIT) break;

      // NOTE: Unlike normal fetch, we do NOT stop on all-duplicates.
      // We keep paginating to ensure every event gets an EventSource entry.

      const oldest = Math.min(...events.map((e) => e.created_at));
      until = oldest - 1;
    }
  } finally {
    ws.close();
  }

  console.log(
    `[collector] Exhaustive recheck done: ${tag} — ${totalEvents} total events, ${totalNewEvents} new`
  );

  return { totalEvents, newEvents: totalNewEvents };
}

// ── Deep fetch all relays ───────────────────────────────────────────

export async function deepFetchAllRelays(
  pubkeyHex: string
): Promise<{ totalEvents: number; newEvents: number }> {
  console.log(`[collector] Deep fetch all relays for ${pubkeyHex.slice(0, 8)}...`);

  const now = new Date();
  const relayStates = await prisma.relay.findMany({
    where: { url: { in: RELAY_URLS } },
    select: { url: true, backoffUntil: true },
  });
  const backoffMap = new Map(relayStates.map((r) => [r.url, r.backoffUntil]));
  const activeUrls = RELAY_URLS.filter((url) => {
    const until = backoffMap.get(url);
    return !until || until <= now;
  });

  console.log(`[collector] Deep fetch: ${activeUrls.length}/${RELAY_URLS.length} relays active`);

  let totalEvents = 0;
  let totalNewEvents = 0;

  // Run sequentially to avoid overwhelming relays
  for (const relayUrl of activeUrls) {
    try {
      const result = await fetchFromSingleRelayExhaustive(relayUrl, pubkeyHex);
      totalEvents += result.totalEvents;
      totalNewEvents += result.newEvents;
    } catch (err) {
      console.error(`[collector] Deep fetch error for ${new URL(relayUrl).hostname}:`, err);
    }
  }

  console.log(
    `[collector] Deep fetch complete for ${pubkeyHex.slice(0, 8)}: ${totalEvents} total events, ${totalNewEvents} new`
  );

  return { totalEvents, newEvents: totalNewEvents };
}

// ── Deep fetch outbox relays (NIP-65) ────────────────────────────────

export async function deepFetchOutboxRelays(
  pubkeyHex: string
): Promise<{ totalEvents: number; newEvents: number; relayCount: number }> {
  const outboxUrls = await getOutboxRelays(pubkeyHex);
  if (outboxUrls.length === 0) {
    console.log(`[collector] No NIP-65 outbox relays found for ${pubkeyHex.slice(0, 8)}`);
    return { totalEvents: 0, newEvents: 0, relayCount: 0 };
  }

  console.log(
    `[collector] Deep fetch outbox relays for ${pubkeyHex.slice(0, 8)}: ${outboxUrls.length} relay(s)`
  );

  let totalEvents = 0;
  let totalNewEvents = 0;

  // Run sequentially to avoid overwhelming relays
  for (const relayUrl of outboxUrls) {
    try {
      const result = await fetchFromSingleRelayExhaustive(relayUrl, pubkeyHex);
      totalEvents += result.totalEvents;
      totalNewEvents += result.newEvents;
    } catch (err) {
      let host: string;
      try { host = new URL(relayUrl).hostname; } catch { host = relayUrl; }
      console.error(`[collector] Outbox fetch error for ${host}:`, err);
    }
  }

  console.log(
    `[collector] Outbox fetch complete for ${pubkeyHex.slice(0, 8)}: ${totalEvents} total events, ${totalNewEvents} new from ${outboxUrls.length} relays`
  );

  return { totalEvents, newEvents: totalNewEvents, relayCount: outboxUrls.length };
}

// ── Concurrent execution helper ─────────────────────────────────────

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;

  async function next(): Promise<void> {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next()
  );

  await Promise.allSettled(workers);
}

// ── Collection cycle ────────────────────────────────────────────────

export async function runCollectionCycle(): Promise<void> {
  const tracked = await prisma.trackedNpub.findMany();

  if (tracked.length === 0) {
    console.log("[collector] No npubs to track.");
    return;
  }

  console.log(
    `[collector] Starting collection cycle for ${tracked.length} npubs (concurrency: ${FETCH_CONCURRENCY})`
  );

  const pool = new RelayPool();

  // Load persisted throttle delays from previous cycles
  await pool.throttler.loadFromDb().catch(console.error);

  try {
    await runConcurrent(tracked, FETCH_CONCURRENCY, async (npub) => {
      try {
        await fetchAllForPubkey(npub.pubkeyHex, pool);
      } catch (err) {
        console.error(`[collector] Error fetching ${npub.npub}:`, err);
      }
    });
  } finally {
    // Persist throttle delays and health results before closing
    await pool.throttler.persistAll().catch(console.error);
    await saveRelayHealth(pool.healthResults).catch(console.error);
    pool.closeAll();
  }

  console.log("[collector] Collection cycle complete.");
}
