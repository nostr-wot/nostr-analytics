-- Compatibility guard for older web bundles that still write cache snapshots.
-- New collectors only update CacheResponse. Keep at most one legacy snapshot
-- per response key until every deployed writer has been updated.
CREATE TRIGGER IF NOT EXISTS bound_legacy_cache_history
AFTER INSERT ON CacheResponseLog
BEGIN
  DELETE FROM CacheResponseLog
  WHERE pubkeyHex = NEW.pubkeyHex
    AND queryType = NEW.queryType
    AND responseKind = NEW.responseKind
    AND id <> NEW.id;
END;
