"use client";

import {
  useWsConnectionState,
  useWsLastEventAge,
  useWsEvents,
} from "../hooks/useWsEvents";

export default function SystemStatusBar() {
  useWsEvents(() => {});
  const { status } = useWsConnectionState();
  const lastEventAge = useWsLastEventAge();

  const connected = status === "connected";
  const connecting = status === "connecting";

  return (
    <div
      className="system-status-bar"
      role="status"
      aria-live="polite"
      aria-label={
        connected ? "실시간 연결" : connecting ? "연결 중" : "연결 끊김"
      }
    >
      <span
        className={`system-status-dot system-status-dot--${status}`}
        aria-hidden
      />
      <span className="system-status-label">
        {connected ? "실시간 연결" : connecting ? "연결 중" : "연결 끊김"}
      </span>
      <span className="system-status-divider" aria-hidden>
        ·
      </span>
      <span className="system-status-sync">
        마지막 수신{" "}
        <strong>{connected ? lastEventAge : "—"}</strong>
      </span>
    </div>
  );
}
