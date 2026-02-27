// ── Connection URLs ────────────────────────────────────────────────

export const CACHE_URL =
  process.env.PRIMAL_CACHE_URL || "wss://cache2.primal.net/v1";
export const RELAY_URLS: string[] = (
  process.env.PRIMAL_RELAY_URLS ||
  [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://relay.snort.social",
    "wss://nostr.wine",
    "wss://purplepag.es",
    "wss://relay.current.fyi",
    "wss://nostr.oxtr.dev",
    "wss://relay.nostr.bg",
    "wss://nostr.bitcoiner.social",
    "wss://nostr.fmt.wiz.biz",
    "wss://eden.nostr.land",
    "wss://nostr-pub.wellorder.net",
    "wss://offchain.pub",
    "wss://nostr-01.yakihonne.com",
    "wss://nostr-02.yakihonne.com",
    "wss://relay.0xchat.com",
    "wss://relay.nos.social",
  ].join(",")
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

// ── Timeouts (ms) ──────────────────────────────────────────────────

export const WS_CONNECT_TIMEOUT = 10_000;
export const EOSE_TIMEOUT_DEFAULT = 15_000;
export const EOSE_TIMEOUT_RELAY = 20_000;

// ── Cache queries ──────────────────────────────────────────────────

export const CACHE_QUERIES: {
  name: string;
  message: string;
  buildPayload: (pubkey: string) => Record<string, unknown>;
}[] = [
  {
    name: "user_profile",
    message: "user_profile",
    buildPayload: (pubkey) => ({ pubkey }),
  },
  {
    name: "contact_list",
    message: "contact_list",
    buildPayload: (pubkey) => ({ pubkey, extended_response: true }),
  },
  {
    name: "user_followers",
    message: "user_followers",
    buildPayload: (pubkey) => ({ pubkey }),
  },
  {
    name: "get_user_relays",
    message: "get_user_relays",
    buildPayload: (pubkey) => ({ pubkey }),
  },
  {
    name: "mutelist",
    message: "mutelist",
    buildPayload: (pubkey) => ({ pubkey, extended_response: true }),
  },
  {
    name: "mutelists",
    message: "mutelists",
    buildPayload: (pubkey) => ({ pubkey, extended_response: true }),
  },
  {
    name: "allowlist",
    message: "allowlist",
    buildPayload: (pubkey) => ({ pubkey, extended_response: true }),
  },
  {
    name: "get_bookmarks",
    message: "get_bookmarks",
    buildPayload: (pubkey) => ({ pubkey }),
  },
  {
    name: "get_notifications",
    message: "get_notifications",
    buildPayload: (pubkey) => ({ pubkey, limit: 10000, type_group: "all" }),
  },
  {
    name: "get_notifications_seen",
    message: "get_notifications_seen",
    buildPayload: (pubkey) => ({ pubkey }),
  },
  {
    name: "notification_counts",
    message: "notification_counts",
    buildPayload: (pubkey) => ({ pubkey }),
  },
  {
    name: "user_zaps_sent",
    message: "user_zaps_sent",
    buildPayload: (pubkey) => ({ sender: pubkey, limit: 10000, offset: 0 }),
  },
  {
    name: "user_profile_scored_content",
    message: "user_profile_scored_content",
    buildPayload: (pubkey) => ({ pubkey, limit: 1000 }),
  },
];

/** Derived list of cache query type names (for UI filter pills) */
export const CACHE_QUERY_TYPES = CACHE_QUERIES.map((q) => q.name);

// ── Relay fetch config ─────────────────────────────────────────────

export const RELAY_KINDS = [
  0, // Metadata
  1, // Text (recent)
  3, // Contacts
  4, // EncryptedDM
  5, // EventDeletion
  6, // Repost
  7, // Reaction
  44, // GiftWrapInner (NIP-44)
  1059, // GiftWrap (NIP-59)
  9735, // Zap
  10000, // MuteList
  10002, // RelayList
  10003, // Bookmarks
  10050, // DMRelayList (NIP-17 inbox preferences)
  10063, // Blossom
  30023, // LongForm (NIP-23 articles)
  30078, // Settings (encrypted app settings)
];

export const RELAY_FETCH_LIMIT = 500;

// ── Concurrency ──────────────────────────────────────────────────

export const FETCH_CONCURRENCY = parseInt(
  process.env.FETCH_CONCURRENCY || "5",
  10
);

// ── Scheduler / UI defaults ────────────────────────────────────────

export const DEFAULT_FETCH_INTERVAL_MINUTES = 10;
export const TOAST_DURATION_MS = 4000;
export const CONTENT_TRUNCATE_LENGTH = 200;
