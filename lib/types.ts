// ── Protocol types (raw from relay/cache) ──────────────────────────

export interface NostrEventWire {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  sig: string;
  created_at: number;
}

export type MessageHandler = {
  onEvent: (event: NostrEventWire) => void;
  onCacheResponse: (kind: number, content: unknown) => void;
  onEose: () => void;
};

export interface EoseResult {
  events: NostrEventWire[];
  cacheResponses: { kind: number; content: unknown }[];
}

// ── API response types ─────────────────────────────────────────────

export interface NostrProfile {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export interface TrackedNpubWithStats {
  id: number;
  npub: string;
  pubkeyHex: string;
  label: string | null;
  addedAt: string;
  lastFetchedAt: string | null;
  eventCount: number;
  cacheCount: number;
  profile: NostrProfile | null;
}

export interface StoredNostrEvent {
  id: number;
  eventId: string;
  pubkeyHex: string;
  kind: number;
  content: string;
  tags: string[][];
  sig: string;
  createdAt: number;
  fetchedAt: string;
  source: string;
}

export interface StoredCacheResponse {
  id: number;
  pubkeyHex: string;
  queryType: string;
  responseKind: number;
  content: unknown;
  fetchedAt: string;
}

export interface KindCount {
  kind: number;
  count: number;
}

export interface RelayCount {
  relay: string;
  count: number;
}

// ── Analytics types ──────────────────────────────────────────────

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  count: number;
}

export interface DailyBoundary {
  date: string;
  firstHour: number;
  lastHour: number;
}

export interface AnalyticsData {
  heatmap: HeatmapCell[];
  kindDistribution: KindCount[];
  relayDistribution: RelayCount[];
  dailyBoundaries: DailyBoundary[];
  totalEvents: number;
  dateRange: { earliest: number; latest: number };
  suggestedTimezoneOffset: number;
  timezoneConfidence: "low" | "medium" | "high" | null;
  timezoneFlagged: boolean;
}

// ── UI types ───────────────────────────────────────────────────────

export type DetailTab = "events" | "cache" | "analytics";

export interface ToastMessage {
  text: string;
  type: "success" | "error";
}
