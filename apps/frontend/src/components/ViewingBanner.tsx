"use client";

import { useEffect, useState } from "react";
import { useWsEvents } from "../hooks/useWsEvents";

export type RemoteSessionPhase = "waiting" | "signaled" | "linked";

type Props = {
  installationId: string;
  onDismiss?: () => void;
};

/** Digital MM:SS (or H:MM:SS) for waiting elapsed. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

/**
 * Compact remote-session status for the sticky tab chrome.
 * waiting → signaled → linked; stays「연결됨」until page leave.
 */
export default function ViewingBanner({ installationId }: Props) {
  const [phase, setPhase] = useState<RemoteSessionPhase>("waiting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  useWsEvents((msg) => {
    if (msg.installationId !== installationId) return;
    if (msg.type === "admin_session_linked") {
      setPhase("linked");
      return;
    }
    if (msg.type === "admin_session_signaled") {
      setPhase((p) => (p === "waiting" ? "signaled" : p));
    }
  });

  const linked = phase === "linked";
  const clock = formatClock(elapsedMs);

  const label =
    phase === "linked"
      ? "원격 연결됨"
      : phase === "signaled"
        ? "세션 전달됨"
        : "원격 연결 대기";

  const hint =
    phase === "linked"
      ? "명령·설정 약 1분 간격"
      : phase === "signaled"
        ? "HMI 명령 폴링 대기"
        : "최대 약 10분 · 텔레메트리 후 연결";

  return (
    <div
      className={`remote-session-status remote-session-status--${phase}`}
      role="status"
      aria-live="polite"
      aria-busy={!linked}
      title={hint}
    >
      <div className="remote-session-status-main">
        {linked ? (
          <span className="remote-session-dot remote-session-dot--ok" aria-hidden>
            <CheckIcon />
          </span>
        ) : (
          <span className="remote-session-dot remote-session-dot--pulse" aria-hidden />
        )}
        <div className="remote-session-copy">
          <span className="remote-session-label">{label}</span>
          <span className="remote-session-hint">{hint}</span>
        </div>
      </div>
      {!linked ? (
        <div className="remote-session-timer" aria-label={`경과 ${clock}`}>
          <span className="remote-session-timer-label">경과</span>
          <span className="remote-session-timer-value">{clock}</span>
        </div>
      ) : (
        <div className="remote-session-timer remote-session-timer--live">
          <span className="remote-session-timer-label">세션</span>
          <span className="remote-session-timer-value">{clock}</span>
        </div>
      )}
    </div>
  );
}
