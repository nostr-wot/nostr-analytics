-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Relay" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastErrorAt" DATETIME,
    "backoffUntil" DATETIME,
    "throttleDelayMs" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Relay" ("backoffUntil", "consecutiveErrors", "firstSeenAt", "id", "lastErrorAt", "url") SELECT "backoffUntil", "consecutiveErrors", "firstSeenAt", "id", "lastErrorAt", "url" FROM "Relay";
DROP TABLE "Relay";
ALTER TABLE "new_Relay" RENAME TO "Relay";
CREATE UNIQUE INDEX "Relay_url_key" ON "Relay"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
