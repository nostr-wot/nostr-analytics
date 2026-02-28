-- AlterTable
ALTER TABLE "RelayCheck" ADD COLUMN "errorCategory" TEXT;

-- CreateTable
CREATE TABLE "Relay" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastErrorAt" DATETIME,
    "backoffUntil" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Relay_url_key" ON "Relay"("url");

-- CreateIndex
CREATE INDEX "RelayCheck_relay_errorCategory_idx" ON "RelayCheck"("relay", "errorCategory");
