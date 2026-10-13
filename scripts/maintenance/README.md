# Cache storage maintenance

The collector keeps current responses in `CacheResponse`. Historical copies in `CacheResponseLog` have no application readers and previously grew to millions of redundant rows. Updated collectors no longer read or write this history.

For existing deployments, stop analytics writers and apply `bound-cache-history.sql` to the analytics SQLite database. It bounds writes from older compiled web bundles to one snapshot per response key. It does not touch current responses, Nostr events, or relay records.

Existing `CacheResponseLog` rows can then be deleted. SQLite initially keeps freed pages for reuse; deletion alone does not return disk space to the filesystem. Compact only with sufficient free space, stopped writers, and integrity/schema/row-count verification before replacing the original database. Never apply this procedure to a wallet database.
