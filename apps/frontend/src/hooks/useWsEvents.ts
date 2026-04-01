"use client";

import { useEffect, useRef } from "react";

export type WsMessage =
  | { type: "welcome"; timestamp: number }
  | { type: "device_updated"; installationId: string }
  | { type: "command_acked"; commandId: string; status: string; installationId: string };

type Handler = (msg: WsMessage) => void;

// ── Module-level singleton ─────────────────────────────────────────────────
// All components share a single WebSocket connection. The connection is
// lazily opened when the first subscriber registers and kept alive with
// exponential-backoff reconnection.
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

let _ws: WebSocket | null = null;
let _attempt = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const _handlers = new Set<Handler>();

function getWsUrl(): string {
  const base =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) ||
    "http://localhost:4000";
  return base.replace(/^http/, "ws") + "/ws";
}

function openConnection(): void {
  if (
    _ws &&
    (_ws.readyState === WebSocket.CONNECTING ||
      _ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  _ws = new WebSocket(getWsUrl());

  _ws.addEventListener("open", () => {
    _attempt = 0;
  });

  _ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data as string) as WsMessage;
      _handlers.forEach((h) => h(msg));
    } catch {
      // ignore malformed frames
    }
  });

  _ws.addEventListener("close", () => {
    _ws = null;
    if (_handlers.size === 0) return;
    const delay =
      RECONNECT_DELAYS_MS[Math.min(_attempt, RECONNECT_DELAYS_MS.length - 1)];
    _attempt++;
    _reconnectTimer = setTimeout(openConnection, delay);
  });

  _ws.addEventListener("error", () => {
    _ws?.close();
  });
}
// ──────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to backend WebSocket push events.
 *
 * Multiple calls share a single connection. The connection is opened
 * automatically on the first subscriber and reconnects with backoff on drop.
 *
 * The `onMessage` callback is kept up-to-date via a ref so callers can use
 * inline arrow functions without worrying about stale closures.
 */
export function useWsEvents(onMessage: Handler): void {
  const ref = useRef<Handler>(onMessage);
  ref.current = onMessage;

  useEffect(() => {
    const stable: Handler = (msg) => ref.current(msg);
    _handlers.add(stable);

    if (_handlers.size === 1) {
      if (_reconnectTimer !== null) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
      }
      openConnection();
    }

    return () => {
      _handlers.delete(stable);
    };
  }, []);
}
