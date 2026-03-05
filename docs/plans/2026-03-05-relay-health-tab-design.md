# Relay Health Tab & Behavioral Insights — Design

## Goal

Add a "Relay Health" tab to the npub profile page that analyzes NIP-65 relay list quality, detects special-purpose relays, and provides actionable recommendations. Add timezone/travel detection via time-series analysis.

## New Tab: "Relay Health"

### Section 1 — Relay List Report Card

Scored assessment with issues and recommendations:

- **Overall score**: "Good" / "Needs Attention" / "Poor" based on weighted checks
- **Issues detected** (warning/error cards):
  - Dead relays — declared but unreachable
  - Zero-event relays — declared but storing no events for this user
  - Over-centralization — >60% of events on a single relay
  - Too few write relays — less than 3 outbox relays
  - Too many relays — more than 10 declared
  - Special-purpose relays — wallet connect, payment, DVM relays in general list
- **Recommendations** — actionable text per issue

### Special-Purpose Relay Detection

Identify by URL patterns and event kind analysis:
- URL contains `nwc`, `wallet`, `alby`, `mutiny` → wallet connect
- Relays that primarily carry kind 13194 (NWC info), 23194/23195 (NWC req/resp) → wallet
- Known DVM relay URLs
- Any relay with 0 standard events but present in relay list

### Section 2 — Relay Distribution Table

Table view of each declared relay: hostname, marker (R/W/R+W), health dot, event count, event %, latency, issues column. Replaces pills with richer detail.

### Section 3 — Timezone & Travel Analysis

New computation in stats-cron.ts:
- Compute activity centroid (peak hour) per weekly window
- Detect shifts in centroid → timezone change / travel
- Store in PubkeyStats as `timezoneTimeline` JSON: `[{period, offset, confidence}]`
- Display as timeline showing timezone shifts over months

### Analytics Tab Cross-Reference

Existing NIP-65 pill section gets a warning badge linking to Relay Health tab when issues exist.

## Schema Changes

Add to `PubkeyStats`:
- `relayHealthScore String?` — JSON: `{score, issues[], recommendations[]}`
- `timezoneTimeline String?` — JSON: `[{period, estimatedOffset, confidence}]`

## Computation

All analysis runs in `stats-cron.ts` after existing stats, stored as precomputed JSON. No live computation at request time.
