"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type WsMessage =
  | { type: "welcome"; timestamp: number }
  | { type: "device_updated"; installationId: string }
  | { type: "command_acked"; commandId: string; status: string; installationId: string };

type Handler = (msg: WsMessage) => void;

export type WsConnectionStatus = "connecting" | "connected" | "disconnected";

export type WsConnectionState = {
  status: WsConnectionStatus;
  lastMessageAt: number | null;
};

// ── Module-level singleton ─────────────────────────────────────────────────
// All components share a single WebSocket connection. The connection is
// lazily opened when the first subscriber registers and kept alive with
// exponential-backoff reconnection.
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

let _ws: WebSocket | null = null;
let _attempt = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const _handlers = new Set<Handler>();
const _connectionListeners = new Set<() => void>();

let _connectionState: WsConnectionState = {
  status: "disconnected",
  lastMessageAt: null,
};

function setConnectionState(patch: Partial<WsConnectionState>): void {
  _connectionState = { ..._connectionState, ...patch };
  _connectionListeners.forEach((l) => l());
}

function subscribeConnection(listener: () => void): () => void {
  _connectionListeners.add(listener);
  return () => _connectionListeners.delete(listener);
}

function getConnectionSnapshot(): WsConnectionState {
  return _connectionState;
}

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

  setConnectionState({ status: "connecting" });
  _ws = new WebSocket(getWsUrl());

  _ws.addEventListener("open", () => {
    _attempt = 0;
    setConnectionState({ status: "connected" });
  });

  _ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data as string) as WsMessage;
      setConnectionState({ lastMessageAt: Date.now() });
      _handlers.forEach((h) => h(msg));
    } catch {
      // ignore malformed frames
    }
  });

  _ws.addEventListener("close", () => {
    _ws = null;
    setConnectionState({ status: "disconnected" });
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

/** Shared WebSocket connection status for header / status bar UI. */
export function useWsConnectionState(): WsConnectionState {
  return useSyncExternalStore(
    subscribeConnection,
    getConnectionSnapshot,
    getConnectionSnapshot,
  );
}

/** Relative time since last WebSocket message (updates every second). */
export function useWsLastEventAge(): string {
  const { lastMessageAt } = useWsConnectionState();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastMessageAt) return "-";
  const sec = Math.floor((Date.now() - lastMessageAt) / 1000);
  if (sec < 5) return "방금";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}
