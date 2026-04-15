import { prisma } from "./db";

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "30", 10);
const BATCH_DELETE_SIZE = 10_000;

/**
 * Prune old data from high-growth tables to keep disk usage bounded.
 * Deletes in batches to avoid long-running transactions that block writers.
 */
export async function runRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();
  console.log(`[retention] Pruning data older than ${RETENTION_DAYS} days (before ${cutoffIso})`);

  const cacheLogDeleted = await batchDelete(
    "CacheResponseLog",
    `DELETE FROM CacheResponseLog WHERE id IN (SELECT id FROM CacheResponseLog WHERE capturedAt < '${cutoffIso}' LIMIT ${BATCH_DELETE_SIZE})`
  );

  const eventSourceDeleted = await batchDelete(
    "EventSource",
    `DELETE FROM EventSource WHERE id IN (SELECT id FROM EventSource WHERE seenAt < '${cutoffIso}' LIMIT ${BATCH_DELETE_SIZE})`
  );

  const relayCheckDeleted = await batchDelete(
    "RelayCheck",
    `DELETE FROM RelayCheck WHERE id IN (SELECT id FROM RelayCheck WHERE checkedAt < '${cutoffIso}' LIMIT ${BATCH_DELETE_SIZE})`
  );

  console.log(
    `[retention] Pruned: CacheResponseLog=${cacheLogDeleted}, EventSource=${eventSourceDeleted}, RelayCheck=${relayCheckDeleted}`
  );

  // Report current DB page stats
  try {
    const pageCount = await prisma.$queryRawUnsafe<{ page_count: number }[]>(
      "SELECT * FROM pragma_page_count()"
    );
    const freePages = await prisma.$queryRawUnsafe<{ freelist_count: number }[]>(
      "SELECT * FROM pragma_freelist_count()"
    );
    const pageSize = await prisma.$queryRawUnsafe<{ page_size: number }[]>(
      "SELECT * FROM pragma_page_size()"
    );
    if (pageCount[0] && freePages[0] && pageSize[0]) {
      const totalMb = Math.round(
        (Number(pageCount[0].page_count) * Number(pageSize[0].page_size)) / 1024 / 1024
      );
      const freeMb = Math.round(
        (Number(freePages[0].freelist_count) * Number(pageSize[0].page_size)) / 1024 / 1024
      );
      console.log(`[retention] DB size: ${totalMb}MB, free pages: ${freeMb}MB`);
    }
  } catch {
    // pragma queries may fail on some adapters
  }
}

async function batchDelete(tableName: string, deleteSql: string): Promise<number> {
  let totalDeleted = 0;
  let batchDeleted: number;

  do {
    batchDeleted = await prisma.$executeRawUnsafe(deleteSql);
    totalDeleted += batchDeleted;
    if (batchDeleted > 0) {
      console.log(`[retention] ${tableName}: deleted batch of ${batchDeleted} (total: ${totalDeleted})`);
    }
  } while (batchDeleted >= BATCH_DELETE_SIZE);

  return totalDeleted;
}