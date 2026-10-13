-- Apply before populating ExcludedPubkey with the requested public keys.
CREATE TABLE IF NOT EXISTS ExcludedPubkey (
  pubkeyHex TEXT NOT NULL PRIMARY KEY
);
CREATE TRIGGER IF NOT EXISTS exclude_tracked_profile
BEFORE INSERT ON TrackedNpub
WHEN EXISTS (SELECT 1 FROM ExcludedPubkey WHERE pubkeyHex = NEW.pubkeyHex)
BEGIN
  SELECT RAISE(ABORT, 'Profile is excluded from analytics collection');
END;
CREATE TRIGGER IF NOT EXISTS exclude_profile_events
BEFORE INSERT ON NostrEvent
WHEN EXISTS (SELECT 1 FROM ExcludedPubkey WHERE pubkeyHex = NEW.pubkeyHex)
BEGIN
  SELECT RAISE(IGNORE);
END;
-- Collection records sources after attempting to insert events. Ignored events
-- must not leave orphan source records, including when returned by another user.
CREATE TRIGGER IF NOT EXISTS require_stored_event_source
BEFORE INSERT ON EventSource
WHEN NOT EXISTS (SELECT 1 FROM NostrEvent WHERE eventId = NEW.eventId)
BEGIN
  SELECT RAISE(IGNORE);
END;
