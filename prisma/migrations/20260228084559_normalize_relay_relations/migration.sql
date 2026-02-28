-- Fix legacy "cache" source values to use the actual cache relay URL
UPDATE "NostrEvent" SET "source" = 'wss://cache2.primal.net/v1' WHERE "source" = 'cache';
UPDATE "EventSource" SET "relay" = 'wss://cache2.primal.net/v1' WHERE "relay" = 'cache';

-- Ensure the cache URL exists in the Relay table before FK constraints are applied
INSERT OR IGNORE INTO "Relay" ("url") VALUES ('wss://cache2.primal.net/v1');

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EventSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "relay" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSource_relay_fkey" FOREIGN KEY ("relay") REFERENCES "Relay" ("url") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EventSource" ("eventId", "id", "relay", "seenAt") SELECT "eventId", "id", "relay", "seenAt" FROM "EventSource";
DROP TABLE "EventSource";
ALTER TABLE "new_EventSource" RENAME TO "EventSource";
CREATE INDEX "EventSource_relay_idx" ON "EventSource"("relay");
CREATE INDEX "EventSource_eventId_idx" ON "EventSource"("eventId");
CREATE UNIQUE INDEX "EventSource_eventId_relay_key" ON "EventSource"("eventId", "relay");
CREATE TABLE "new_NostrEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "pubkeyHex" TEXT NOT NULL,
    "kind" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    CONSTRAINT "NostrEvent_source_fkey" FOREIGN KEY ("source") REFERENCES "Relay" ("url") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_NostrEvent" ("content", "createdAt", "eventId", "fetchedAt", "id", "kind", "pubkeyHex", "sig", "source", "tags") SELECT "content", "createdAt", "eventId", "fetchedAt", "id", "kind", "pubkeyHex", "sig", "source", "tags" FROM "NostrEvent";
DROP TABLE "NostrEvent";
ALTER TABLE "new_NostrEvent" RENAME TO "NostrEvent";
CREATE UNIQUE INDEX "NostrEvent_eventId_key" ON "NostrEvent"("eventId");
CREATE INDEX "NostrEvent_pubkeyHex_idx" ON "NostrEvent"("pubkeyHex");
CREATE INDEX "NostrEvent_kind_idx" ON "NostrEvent"("kind");
CREATE INDEX "NostrEvent_pubkeyHex_kind_idx" ON "NostrEvent"("pubkeyHex", "kind");
CREATE INDEX "NostrEvent_createdAt_idx" ON "NostrEvent"("createdAt");
CREATE TABLE "new_RelayCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "relay" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "error" TEXT,
    "errorCategory" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelayCheck_relay_fkey" FOREIGN KEY ("relay") REFERENCES "Relay" ("url") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RelayCheck" ("checkedAt", "error", "errorCategory", "id", "latencyMs", "relay", "status") SELECT "checkedAt", "error", "errorCategory", "id", "latencyMs", "relay", "status" FROM "RelayCheck";
DROP TABLE "RelayCheck";
ALTER TABLE "new_RelayCheck" RENAME TO "RelayCheck";
CREATE INDEX "RelayCheck_relay_checkedAt_idx" ON "RelayCheck"("relay", "checkedAt");
CREATE INDEX "RelayCheck_checkedAt_idx" ON "RelayCheck"("checkedAt");
CREATE INDEX "RelayCheck_relay_errorCategory_idx" ON "RelayCheck"("relay", "errorCategory");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
