-- CreateTable
CREATE TABLE "RelayCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "relay" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "error" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RelayCheck_relay_checkedAt_idx" ON "RelayCheck"("relay", "checkedAt");
