import { prisma } from "./db";
import { classifyError } from "./error-classifier";
import { RELAY_URLS, CACHE_URL } from "./constants";
import type { ConnectionResult } from "./relay-pool";

/** Backoff: min(10min * 2^(errors-1), 60min) + 10% jitter */
function computeBackoffUntil(consecutiveErrors: number): Date {
  const baseMs = 10 * 60 * 1000; // 10 minutes
  const capMs = 60 * 60 * 1000; // 60 minutes
  const delayMs = Math.min(baseMs * Math.pow(2, consecutiveErrors - 1), capMs);
  const jitter = delayMs * 0.1 * Math.random();
  return new Date(Date.now() + delayMs + jitter);
}

/**
 * Save health check results from pool connections and clean up old entries.
 * Classifies errors, upserts Relay backoff state.
 */
export async function saveRelayHealth(
  results: ConnectionResult[]
): Promise<void> {
  if (results.length === 0) return;

  // Classify errors once, reuse for DB insert and logging
  const classified = results.map((r) => ({
    ...r,
    errorCategory: r.status === "error" ? classifyError(r.error) : null,
  }));

  // Ensure all relay URLs exist in Relay table (outbox relays may be new)
  const knownUrls = new Set(
    (await prisma.relay.findMany({ select: { url: true } })).map((r) => r.url)
  );
  for (const r of classified) {
    if (!knownUrls.has(r.url)) {
      await prisma.relay.upsert({
        where: { url: r.url },
        update: {},
        create: { url: r.url },
      });
      knownUrls.add(r.url);
    }
  }

  // Insert checks with error classification
  await prisma.relayCheck.createMany({
    data: classified.map((r) => ({
      relay: r.url,
      status: r.status,
      latencyMs: r.latencyMs,
      error: r.error ?? null,
      errorCategory: r.errorCategory,
    })),
  });

  // Upsert Relay backoff state for each result (transactional for atomicity)
  for (const r of classified) {
    if (r.status === "ok") {
      // Success — reset backoff
      await prisma.relay.upsert({
        where: { url: r.url },
        update: { consecutiveErrors: 0, backoffUntil: null },
        create: { url: r.url, consecutiveErrors: 0 },
      });
    } else if (r.errorCategory === "rate_limit") {
      // Rate limit — record the check but don't increment backoff.
      // The throttler handles spacing out requests instead.
      await prisma.relay.upsert({
        where: { url: r.url },
        update: { lastErrorAt: new Date() },
        create: { url: r.url, lastErrorAt: new Date() },
      });
    } else {
      // Error — atomic increment and compute backoff
      await prisma.$transaction(async (tx) => {
        const existing = await tx.relay.findUnique({ where: { url: r.url } });
        const newErrors = (existing?.consecutiveErrors ?? 0) + 1;
        await tx.relay.upsert({
          where: { url: r.url },
          update: {
            consecutiveErrors: newErrors,
            lastErrorAt: new Date(),
            backoffUntil: computeBackoffUntil(newErrors),
          },
          create: {
            url: r.url,
            consecutiveErrors: newErrors,
            lastErrorAt: new Date(),
            backoffUntil: computeBackoffUntil(newErrors),
          },
        });
      });
    }
  }

  // Clean up checks older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.relayCheck.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });

  const okCount = classified.filter((r) => r.status === "ok").length;
  const errorResults = classified.filter((r) => r.status === "error");
  const categories = errorResults.map((r) => r.errorCategory).filter(Boolean);

  console.log(
    `[relay-health] ${results.length} relays: ${okCount} ok, ${errorResults.length} error` +
      (categories.length > 0 ? ` (${categories.join(", ")})` : "")
  );
}

/** Seed Relay table with all known relay URLs. */
export async function ensureRelaysExist(): Promise<void> {
  const allUrls = [...RELAY_URLS, CACHE_URL];
  for (const url of allUrls) {
    await prisma.relay.upsert({
      where: { url },
      update: {},
      create: { url },
    });
  }
  console.log(`[relay-health] Ensured ${allUrls.length} relays exist`);
}
