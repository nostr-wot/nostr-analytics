-- DeleteDuplicates (keep latest row per pubkeyHex+queryType+responseKind)
DELETE FROM "CacheResponse" WHERE "id" NOT IN (
  SELECT MAX("id") FROM "CacheResponse" GROUP BY "pubkeyHex", "queryType", "responseKind"
);

-- CreateIndex
CREATE UNIQUE INDEX "CacheResponse_pubkeyHex_queryType_responseKind_key" ON "CacheResponse"("pubkeyHex", "queryType", "responseKind");
