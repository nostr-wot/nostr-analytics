import { prisma } from "./db";
import {
  THROTTLE_INITIAL_DELAY_MS,
  THROTTLE_MAX_DELAY_MS,
  THROTTLE_INCREASE_FACTOR,
  THROTTLE_DECAY_FACTOR,
  THROTTLE_FLOOR_MS,
} from "./constants";

interface RelayState {
  delayMs: number;
  /** Resolves when the previous request to this relay has finished waiting. */
  tail: Promise<void>;
}

/**
 * Per-relay request throttler. Concurrent callers to the same relay
 * queue up via promise chaining so requests are spaced by `delayMs`.
 */
export class RelayThrottler {
  private state = new Map<string, RelayState>();

  /** Wait until it's safe to send a request to `url`. */
  async acquire(url: string): Promise<void> {
    const s = this.getOrCreate(url);
    if (s.delayMs === 0) return;

    // Chain: wait for previous caller's delay to elapse, then add our own
    const prev = s.tail;
    let resolve!: () => void;
    s.tail = new Promise<void>((r) => (resolve = r));

    await prev;
    await sleep(s.delayMs);
    resolve();
  }

  /** Called on 429 — increase (or initialise) the delay for `url`. */
  reportRateLimit(url: string): void {
    const s = this.getOrCreate(url);
    if (s.delayMs === 0) {
      s.delayMs = THROTTLE_INITIAL_DELAY_MS;
    } else {
      s.delayMs = Math.min(
        s.delayMs * THROTTLE_INCREASE_FACTOR,
        THROTTLE_MAX_DELAY_MS
      );
    }
    console.log(
      `[throttler] ${new URL(url).hostname}: rate limited → delay ${s.delayMs}ms`
    );
  }

  /** Called on success — decay the delay for `url`. */
  reportSuccess(url: string): void {
    const s = this.state.get(url);
    if (!s || s.delayMs === 0) return;

    s.delayMs = Math.round(s.delayMs * THROTTLE_DECAY_FACTOR);
    if (s.delayMs < THROTTLE_FLOOR_MS) {
      s.delayMs = 0;
      console.log(
        `[throttler] ${new URL(url).hostname}: delay removed`
      );
    }
  }

  /** Load persisted delays from the Relay table. */
  async loadFromDb(): Promise<void> {
    const relays = await prisma.relay.findMany({
      where: { throttleDelayMs: { gt: 0 } },
      select: { url: true, throttleDelayMs: true },
    });
    for (const r of relays) {
      const s = this.getOrCreate(r.url);
      s.delayMs = r.throttleDelayMs;
    }
    if (relays.length > 0) {
      console.log(
        `[throttler] Loaded delays for ${relays.length} relay(s)`
      );
    }
  }

  /** Persist current delays to the Relay table. */
  async persistAll(): Promise<void> {
    const entries = [...this.state.entries()];
    for (const [url, s] of entries) {
      await prisma.relay.updateMany({
        where: { url },
        data: { throttleDelayMs: s.delayMs },
      });
    }
  }

  private getOrCreate(url: string): RelayState {
    let s = this.state.get(url);
    if (!s) {
      s = { delayMs: 0, tail: Promise.resolve() };
      this.state.set(url, s);
    }
    return s;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
