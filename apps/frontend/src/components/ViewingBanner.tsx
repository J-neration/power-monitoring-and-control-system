"use client";

import { useEffect, useState } from "react";
import { useWsEvents } from "../hooks/useWsEvents";

export type RemoteSessionPhase = "waiting" | "signaled" | "linked";

type Props = {
  installationId: string;
  onDismiss?: () => void;
};

const STORAGE_PREFIX = "pmcs.remoteSession.phase:";

function readStoredPhase(installationId: string): RemoteSessionPhase {
  try {
    const v = sessionStorage.getItem(STORAGE_PREFIX + installationId);
    if (v === "waiting" || v === "signaled" || v === "linked") return v;
  } catch {
    // ignore
  }
  return "waiting";
}

function writeStoredPhase(
  installationId: string,
  phase: RemoteSessionPhase,
): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + installationId, phase);
  } catch {
    // ignore
  }
}

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

function advancePhase(
  current: RemoteSessionPhase,
  next: RemoteSessionPhase,
): RemoteSessionPhase {
  const rank = { waiting: 0, signaled: 1, linked: 2 } as const;
  return rank[next] >= rank[current] ? next : current;
}

/**
 * Compact remote-session status for the sticky tab chrome.
 * waiting → signaled → linked. Phase is persisted so remounts / refresh
 * do not drop back to「폴링 대기」after HMI is already linked.
 */
export default function ViewingBanner({ installationId }: Props) {
  const [phase, setPhase] = useState<RemoteSessionPhase>(() =>
    readStoredPhase(installationId),
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    setPhase(readStoredPhase(installationId));
  }, [installationId]);

  useEffect(() => {
    writeStoredPhase(installationId, phase);
  }, [installationId, phase]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  useWsEvents((msg) => {
    // WsMessage 유니온에는 installationId 가 없는 변형(welcome)이 있다.
    // msg.type 으로 먼저 좁혀야 installationId 에 접근할 수 있다.
    if (
      msg.type !== "admin_session_linked" &&
      msg.type !== "admin_session_signaled"
    ) {
      return;
    }
    if (msg.installationId !== installationId) return;

    if (msg.type === "admin_session_linked") {
      setPhase((p) => advancePhase(p, "linked"));
      return;
    }
    if (msg.type === "admin_session_signaled") {
      setPhase((p) => advancePhase(p, "signaled"));
      return;
    }
    // HMI executed a command ⇒ it is polling — treat as linked even if the
    // dedicated linked WS event was missed (refresh / reconnect).
    if (msg.type === "command_acked") {
      setPhase((p) => advancePhase(p, "linked"));
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
        ? "HMI 명령 폴링 확인 중"
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
      <div
        className={`remote-session-timer${linked ? " remote-session-timer--live" : ""}`}
        aria-label={`경과 ${clock}`}
      >
        <span className="remote-session-timer-label">
          {linked ? "세션" : "경과"}
        </span>
        <span className="remote-session-timer-value">{clock}</span>
      </div>
    </div>
  );
}
