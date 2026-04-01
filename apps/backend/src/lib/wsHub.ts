/** Minimal interface satisfied by both ws.WebSocket and native WebSocket */
interface WsClient {
  readyState: number;
  send(data: string): void;
}

const WS_OPEN = 1;
const clients = new Set<WsClient>();

export const wsHub = {
  add(ws: WsClient) {
    clients.add(ws);
  },
  remove(ws: WsClient) {
    clients.delete(ws);
  },
  broadcast(msg: Record<string, unknown>) {
    if (clients.size === 0) return;
    const json = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === WS_OPEN) {
        try {
          ws.send(json);
        } catch {
          clients.delete(ws);
        }
      }
    }
  },
  get size() {
    return clients.size;
  },
};
