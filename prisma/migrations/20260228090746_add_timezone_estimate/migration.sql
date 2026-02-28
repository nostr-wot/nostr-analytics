-- CreateTable
CREATE TABLE "TimezoneEstimate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pubkeyHex" TEXT NOT NULL,
    "estimatedUtcOffset" REAL NOT NULL,
    "confidence" TEXT NOT NULL,
    "activityPeakUtc" REAL NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "daySpread" INTEGER NOT NULL,
    "stddevHours" REAL NOT NULL,
    "flaggedUnreliable" BOOLEAN NOT NULL DEFAULT false,
    "lastComputedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TimezoneEstimate_pubkeyHex_key" ON "TimezoneEstimate"("pubkeyHex");
