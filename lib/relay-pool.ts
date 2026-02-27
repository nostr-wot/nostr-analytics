import WebSocket from "ws";
import { connectWebSocket } from "./websocket";

export class RelayPool {
  private connections = new Map<string, WebSocket>();
  private pending = new Map<string, Promise<WebSocket>>();

  async get(url: string): Promise<WebSocket> {
    const existing = this.connections.get(url);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing;
    }

    // Coalesce concurrent connection attempts to the same URL
    const inflight = this.pending.get(url);
    if (inflight) return inflight;

    const promise = connectWebSocket(url).then((ws) => {
      this.connections.set(url, ws);
      this.pending.delete(url);

      // Multiple npubs share one connection, each adding a message listener
      ws.setMaxListeners(50);

      ws.on("close", () => this.connections.delete(url));
      ws.on("error", () => this.connections.delete(url));

      return ws;
    });

    this.pending.set(url, promise);

    try {
      return await promise;
    } catch (err) {
      this.pending.delete(url);
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
