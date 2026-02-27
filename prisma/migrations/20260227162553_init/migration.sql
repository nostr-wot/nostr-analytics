-- CreateTable
CREATE TABLE "TrackedNpub" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "npub" TEXT NOT NULL,
    "pubkeyHex" TEXT NOT NULL,
    "label" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" DATETIME
);

-- CreateTable
CREATE TABLE "NostrEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "pubkeyHex" TEXT NOT NULL,
    "kind" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CacheResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pubkeyHex" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "responseKind" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedNpub_npub_key" ON "TrackedNpub"("npub");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedNpub_pubkeyHex_key" ON "TrackedNpub"("pubkeyHex");

-- CreateIndex
CREATE UNIQUE INDEX "NostrEvent_eventId_key" ON "NostrEvent"("eventId");

-- CreateIndex
CREATE INDEX "NostrEvent_pubkeyHex_idx" ON "NostrEvent"("pubkeyHex");

-- CreateIndex
CREATE INDEX "NostrEvent_kind_idx" ON "NostrEvent"("kind");

-- CreateIndex
CREATE INDEX "NostrEvent_pubkeyHex_kind_idx" ON "NostrEvent"("pubkeyHex", "kind");

-- CreateIndex
CREATE INDEX "NostrEvent_createdAt_idx" ON "NostrEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CacheResponse_pubkeyHex_idx" ON "CacheResponse"("pubkeyHex");

-- CreateIndex
CREATE INDEX "CacheResponse_queryType_idx" ON "CacheResponse"("queryType");

-- CreateIndex
CREATE INDEX "CacheResponse_pubkeyHex_queryType_idx" ON "CacheResponse"("pubkeyHex", "queryType");
