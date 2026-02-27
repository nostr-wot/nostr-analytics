import WebSocket from "ws";
import { WS_CONNECT_TIMEOUT, EOSE_TIMEOUT_DEFAULT } from "./constants";
import type { NostrEventWire, MessageHandler, EoseResult } from "./types";

export function connectWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection timeout for ${url}`));
    }, WS_CONNECT_TIMEOUT);

    ws.on("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export function sendCacheRequest(
  ws: WebSocket,
  subId: string,
  cacheMessage: string,
  payload: Record<string, unknown>
): void {
  ws.send(JSON.stringify(["REQ", subId, { cache: [cacheMessage, payload] }]));
}

export function sendRelayRequest(
  ws: WebSocket,
  subId: string,
  filter: Record<string, unknown>
): void {
  ws.send(JSON.stringify(["REQ", subId, filter]));
}

export function waitForEose(
  ws: WebSocket,
  subId: string,
  timeoutMs = EOSE_TIMEOUT_DEFAULT
): Promise<EoseResult> {
  return new Promise((resolve) => {
    const events: NostrEventWire[] = [];
    const cacheResponses: { kind: number; content: unknown }[] = [];

    const cleanup = () => ws.removeListener("message", onMessage);

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ events, cacheResponses });
    }, timeoutMs);

    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        const [type, sid, content] = msg;

        if (sid !== subId) return;

        if (type === "EVENT" && content) {
          if (content.id && content.sig) {
            events.push(content);
          } else if (content.kind !== undefined) {
            cacheResponses.push({ kind: content.kind, content });
          }
        }
        if (type === "EOSE") {
          clearTimeout(timeout);
          cleanup();
          resolve({ events, cacheResponses });
        }
      } catch {
        // skip unparseable messages
      }
    };

    ws.on("message", onMessage);
  });
}
