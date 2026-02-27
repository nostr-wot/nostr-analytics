-- CreateTable
CREATE TABLE "EventSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "relay" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EventSource_relay_idx" ON "EventSource"("relay");

-- CreateIndex
CREATE INDEX "EventSource_eventId_idx" ON "EventSource"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSource_eventId_relay_key" ON "EventSource"("eventId", "relay");
