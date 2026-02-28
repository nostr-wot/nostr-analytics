-- CreateTable
CREATE TABLE "PubkeyStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pubkeyHex" TEXT NOT NULL,
    "kindDistribution" TEXT NOT NULL,
    "relayDistribution" TEXT NOT NULL,
    "totalEvents" INTEGER NOT NULL,
    "earliestEvent" INTEGER NOT NULL,
    "latestEvent" INTEGER NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RelaySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "relay" TEXT NOT NULL,
    "uptime24h" REAL,
    "uptime7d" REAL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GlobalStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "totalCacheResponses" INTEGER NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrackedNpub" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "npub" TEXT NOT NULL,
    "pubkeyHex" TEXT NOT NULL,
    "label" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" DATETIME,
    "cachedEventCount" INTEGER NOT NULL DEFAULT 0,
    "cachedCacheCount" INTEGER NOT NULL DEFAULT 0,
    "cachedProfile" TEXT,
    "statsComputedAt" DATETIME
);
INSERT INTO "new_TrackedNpub" ("addedAt", "id", "label", "lastFetchedAt", "npub", "pubkeyHex") SELECT "addedAt", "id", "label", "lastFetchedAt", "npub", "pubkeyHex" FROM "TrackedNpub";
DROP TABLE "TrackedNpub";
ALTER TABLE "new_TrackedNpub" RENAME TO "TrackedNpub";
CREATE UNIQUE INDEX "TrackedNpub_npub_key" ON "TrackedNpub"("npub");
CREATE UNIQUE INDEX "TrackedNpub_pubkeyHex_key" ON "TrackedNpub"("pubkeyHex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PubkeyStats_pubkeyHex_key" ON "PubkeyStats"("pubkeyHex");

-- CreateIndex
CREATE UNIQUE INDEX "RelaySnapshot_relay_key" ON "RelaySnapshot"("relay");
