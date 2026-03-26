# Nostr Analytics

A Nostr analytics and event collection dashboard. Tracks pubkeys, collects their events from relays and the Primal cache, and provides behavioral analytics.

Built with Next.js 16, SQLite (Prisma + libsql), Recharts, and nostr-tools.

## Pages

### Dashboard (`/`)

The main control panel for managing tracked Nostr pubkeys and the event collection scheduler.

- **Scheduler controls** (admin) — start/stop auto-fetching (10-min cycle), trigger immediate fetch, live-streaming scheduler log
- **Add npubs** (admin) — paste npubs to start tracking them
- **Npub table** — all tracked pubkeys with avatar, display name, NIP-05, event/cache counts, last-fetched time. Rows link to profile detail. Admin can select and remove, or fetch individual pubkeys on demand
- **Global stats** (admin) — total event and cache response counts

### Relay List (`/relays`)

Health monitoring dashboard for all connected Nostr relays. Auto-refreshes every 30 seconds.

- Online/offline counters
- Table with status dot, hostname, latency (color-coded), 24h uptime bar (144 segments), 7d uptime %, event count
- Rows link to relay detail

### Relay Detail (`/relays/[url]`)

Deep dive into a single relay. Four tabs:

- **Overview** — check history bar, status timeline showing online/offline transitions with durations
- **Latency** — min/avg/max stats, hourly average latency area chart (7 days)
- **Errors** — consecutive error alert, error breakdown by category (timeout, connection refused, rate limited, auth required, protocol error), recent errors list
- **Events** — total count, table of recent events with kind labels

### Profile Detail (`/npub/[npub]`)

Full profile view and event explorer for a tracked pubkey.

**Header:** avatar, display name, NIP-05, npub/hex, bio, event/cache counts, last fetched

**Admin action bar:** reload profile (re-fetch kind 0), recheck relay (exhaustive fetch from one relay), deep fetch all relays, fetch outbox (NIP-65 declared relays)

Three tabs:

- **Nostr Events** — search bar, kind filter pills, paginated event cards showing kind, source relay, content (expandable), tags (collapsible), event ID
- **Cache Responses** — filter by query type (profile, contacts, followers, relays, mutelist, bookmarks, notifications, zaps, etc.), paginated cards with expandable JSON content
- **Analytics** — summary stats, NIP-65 relay list with health indicators, activity heatmap (day x hour), event type distribution (donut chart), relay distribution (donut chart), events per relay over time (stacked area, with outbox toggle), daily activity window (area chart), "When to Contact" section with peak DM hours and responsiveness score. Bottom filter bar with multi-select kind/relay pills and timezone slider with auto-estimation

### Global Layout

Every page includes:

- **Nav bar** — "Nostr Analytics" logo link, "Relays" link, login button
- **Auth** — Nostr browser extension login (e.g. Alby). Shows truncated pubkey and admin badge when authenticated
- Dark zinc/charcoal theme with Geist font

## Tech Stack

- **Framework:** Next.js 16 (App Router, standalone output)
- **Database:** SQLite via Prisma + libsql
- **Nostr:** nostr-tools, raw WebSocket connections to relays
- **Charts:** Recharts
- **Styling:** Tailwind CSS
- **Auth:** Nostr browser extension (NIP-07), server-side admin check
- **Scheduler:** Separate PM2 process (`tsx scripts/scheduler-worker.ts`)

## Data Model

| Model | Purpose |
|---|---|
| `TrackedNpub` | Pubkeys being monitored, with cached profile and counts |
| `NostrEvent` | Stored Nostr events (all kinds) |
| `EventSource` | Which relays have seen which events |
| `CacheResponse` | Primal cache API responses per pubkey/query type |
| `CacheResponseLog` | Audit log of overwritten cache responses |
| `Relay` | Known relays with backoff and throttle state |
| `RelayCheck` | Health check history (status, latency, errors) |
| `RelaySnapshot` | Pre-computed relay uptime and event counts |
| `PubkeyStats` | Pre-computed per-pubkey analytics (kind/relay distributions, DM activity) |
| `TimezoneEstimate` | Inferred timezone per pubkey from activity patterns |
| `GlobalStats` | Singleton aggregate counts |

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

To run the scheduler separately:

```bash
npm run scheduler
```

## Deployment

Deployed via PM2 on an ARM64 Linux server with standalone Next.js build. See `CLAUDE.md` for deployment details.

## References
- [nostr-wot.com](https://nostr-wot.com)
