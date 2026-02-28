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
  await prisma.cacheResponse.upsert({
    where: {
      pubkeyHex_queryType_responseKind: {
        pubkeyHex,
        queryType,
        responseKind: kind,
      },
    },
    update: {
      content: JSON.stringify(content),
    },
    create: {
      pubkeyHex,
      queryType,
      responseKind: kind,
      content: JSON.stringify(content),
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

      const stored = await storeNostrEventsBatch(events, "cache");
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

// ── Relay fetch (with optional connection pool) ─────────────────────

async function fetchFromSingleRelay(
  relayUrl: string,
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{ newEvents: number }> {
  let totalNewEvents = 0;
  const usePool = !!pool;
  const tag = `${pubkeyHex.slice(0, 8)} ${new URL(relayUrl).hostname}`;

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

      sendRelayRequest(ws, subId, filter);
      const { events } = await waitForEose(ws, subId, EOSE_TIMEOUT_RELAY);

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

// ── Public API ──────────────────────────────────────────────────────

export async function fetchAllForPubkey(
  pubkeyHex: string,
  pool?: RelayPool
): Promise<{
  newEvents: number;
  newCacheResponses: number;
}> {
  console.log(`[collector] Fetching data for ${pubkeyHex.slice(0, 8)}...`);

  const [cacheResult, relayResult] = await Promise.all([
    fetchFromCache(pubkeyHex, pool),
    fetchFromRelays(pubkeyHex, pool),
  ]);

  const totalNewEvents = cacheResult.newEvents + relayResult.newEvents;
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

  try {
    await runConcurrent(tracked, FETCH_CONCURRENCY, async (npub) => {
      try {
        await fetchAllForPubkey(npub.pubkeyHex, pool);
      } catch (err) {
        console.error(`[collector] Error fetching ${npub.npub}:`, err);
      }
    });
  } finally {
    // Save health results from actual connections before closing
    await saveRelayHealth(pool.healthResults).catch(console.error);
    pool.closeAll();
  }

  console.log("[collector] Collection cycle complete.");
}
