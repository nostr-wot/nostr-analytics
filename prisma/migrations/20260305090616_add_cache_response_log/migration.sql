-- CreateTable
CREATE TABLE "CacheResponseLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pubkeyHex" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "responseKind" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CacheResponseLog_pubkeyHex_queryType_responseKind_idx" ON "CacheResponseLog"("pubkeyHex", "queryType", "responseKind");

-- CreateIndex
CREATE INDEX "CacheResponseLog_capturedAt_idx" ON "CacheResponseLog"("capturedAt");
