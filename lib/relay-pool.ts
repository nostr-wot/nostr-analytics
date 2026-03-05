import WebSocket from "ws";
import { connectWebSocket } from "./websocket";
import { RelayThrottler } from "./relay-throttler";

export interface ConnectionResult {
  url: string;
  status: "ok" | "error";
  latencyMs: number | null;
  error?: string;
}

const RATE_LIMIT_RE = /429|rate.?limit|too many/i;

export class RelayPool {
  private connections = new Map<string, WebSocket>();
  private pending = new Map<string, Promise<WebSocket>>();
  private _healthResults = new Map<string, ConnectionResult>();
  readonly throttler = new RelayThrottler();

  /** Health results recorded during this pool's lifetime (one per URL). */
  get healthResults(): ConnectionResult[] {
    return [...this._healthResults.values()];
  }

  async get(url: string): Promise<WebSocket> {
    const existing = this.connections.get(url);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing;
    }

    // Coalesce concurrent connection attempts to the same URL
    const inflight = this.pending.get(url);
    if (inflight) return inflight;

    const start = Date.now();
    const promise = connectWebSocket(url).then((ws) => {
      this.connections.set(url, ws);
      this.pending.delete(url);

      // Record health on first successful connect
      if (!this._healthResults.has(url)) {
        this._healthResults.set(url, {
          url,
          status: "ok",
          latencyMs: Date.now() - start,
        });
      }

      // Multiple npubs share one connection, each adding message listeners
      // Cache queries add ~13 listeners per npub, relays add fewer
      ws.setMaxListeners(100);

      ws.on("close", () => this.connections.delete(url));
      ws.on("error", () => this.connections.delete(url));

      return ws;
    });

    this.pending.set(url, promise);

    try {
      return await promise;
    } catch (err) {
      this.pending.delete(url);

      const errMsg = err instanceof Error ? err.message : String(err);

      // 429 at connection level → throttle, don't treat as hard error
      if (RATE_LIMIT_RE.test(errMsg)) {
        this.throttler.reportRateLimit(url);
      }

      // Record health on first failed connect
      if (!this._healthResults.has(url)) {
        this._healthResults.set(url, {
          url,
          status: "error",
          latencyMs: null,
          error: errMsg,
        });
      }

      throw err;
    }
  }

  closeAll(): void {
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.pending.clear();
  }
}
