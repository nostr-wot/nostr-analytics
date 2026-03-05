# Landing Page & Nav Restructure — Design

## Goal

Replace the current `/` (admin dashboard) with a public landing page showcasing analytics capabilities. Move the dashboard to `/npubs`. Add "Npubs" link to navbar alongside "Relays".

## Route Changes

| Route | Before | After |
|---|---|---|
| `/` | Admin dashboard (npub table, scheduler) | Public landing page |
| `/npubs` | (does not exist) | Admin dashboard moved here |
| `/relays` | Relay list | Unchanged |

## Navbar

Before: `Nostr Analytics | Relays | LoginButton`
After: `Nostr Analytics | Npubs | Relays | LoginButton`

## Landing Page Sections

### 1. Hero

Headline "Nostr Analytics" with subtitle about monitoring relay health and npub behavior. Two CTA buttons: "Explore Npubs" and "Relay Status".

### 2. Live Stats Bar

3-4 stat cards from existing data (GlobalStats + RelaySnapshot + TrackedNpub count): tracked npubs, monitored relays, total events, average relay uptime. Server component, fetched at render time.

### 3. Feature Grid — "What You Can Analyze"

Six cards:

- **Event Storage Asymmetry** — which relays hold which events, gaps in relay coverage
- **Relay List Quality** — NIP-65 declarations vs actual reachability and event storage
- **Storage Centralization** — event concentration across relays, single-relay dependencies
- **Activity Patterns** — heatmaps, daily active windows, timezone estimation, peak hours
- **Relay Health Monitoring** — latency, uptime, error categorization, backoff detection
- **Event Collection** — bulk collection, exhaustive rechecks, outbox relay fetching

### 4. Analytics Preview

Descriptions of chart types: activity heatmap, kind/relay distribution donuts, relay timeline, daily activity window, DM responsiveness. Each with a link to explore.

## Implementation

- Landing page is a server component (no client-side state needed)
- Reuses existing Prisma queries for live stats, no new API endpoints
- Current `app/page.tsx` content moves to `app/npubs/page.tsx`
- New `app/page.tsx` is the landing page
- Navbar update in `app/layout.tsx`
