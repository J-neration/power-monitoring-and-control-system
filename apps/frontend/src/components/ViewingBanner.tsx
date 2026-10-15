"use client";

import { useCallback, useEffect, useState } from "react";
import { useWsEvents } from "../hooks/useWsEvents";

export type RemoteSessionPhase = "closed" | "waiting" | "signaled" | "linked";

type Props = {
  installationId: string;
};

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseUntil(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
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

const RANK = { closed: 0, waiting: 1, signaled: 2, linked: 3 } as const;

function advancePhase(
  current: RemoteSessionPhase,
  next: RemoteSessionPhase,
): RemoteSessionPhase {
  if (current === "closed") return current;
  return RANK[next] >= RANK[current] ? next : current;
}

/**
 * Remote window status + 「원격 연결 열기」 for the settings tab.
 * The window is opened by this button or by any command, lasts 15 min on the
 * server, and HMI only learns about it at its next telemetry (~10 min).
 * Countdown uses the server's `until` so other tabs / admins stay in sync.
 */
export default function ViewingBanner({ installationId }: Props) {
  const [until, setUntil] = useState<number | null>(null);
  const [phase, setPhase] = useState<RemoteSessionPhase>("closed");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyUntil = useCallback((next: number | null) => {
    setUntil(next);
    setNow(Date.now());
    setPhase((p) => {
      if (next === null || next <= Date.now()) return "closed";
      return p === "closed" ? "waiting" : p;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPhase("closed");
    setUntil(null);
    setError(null);
    fetch(`/api/devices/${encodeURIComponent(installationId)}/viewing/status`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { until?: unknown } | null) => {
        if (!cancelled && data) applyUntil(parseUntil(data.until));
      })
      .catch(() => {
        // status is best-effort; WS / button still work
      });
    return () => {
      cancelled = true;
    };
  }, [installationId, applyUntil]);

  useEffect(() => {
    if (until === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) {
        setUntil(null);
        setPhase("closed");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [until]);

  useWsEvents((msg) => {
    if (
      msg.type !== "admin_session_opened" &&
      msg.type !== "admin_session_linked" &&
      msg.type !== "admin_session_signaled" &&
      msg.type !== "command_acked"
    ) {
      return;
    }
    if (msg.installationId !== installationId) return;

    if (msg.type === "admin_session_opened") {
      applyUntil(parseUntil(msg.until));
      return;
    }
    if (msg.type === "admin_session_linked" || msg.type === "command_acked") {
      // command_acked: HMI 가 폴링 중이면 linked 로 간주 (linked WS 누락 대비)
      setPhase((p) => advancePhase(p, "linked"));
      return;
    }
    setPhase((p) => advancePhase(p, "signaled"));
  });

  async function openWindow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(installationId)}/viewing/start`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as {
        until?: unknown;
        message?: string;
      } | null;
      if (!res.ok) {
        setError(data?.message ?? "원격 연결을 열지 못했습니다.");
        return;
      }
      const next = parseUntil(data?.until);
      if (next === null) {
        setError("서버가 연결 종료 시각을 보내지 않았습니다. 백엔드 버전을 확인하세요.");
        return;
      }
      applyUntil(next);
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  const open = phase !== "closed" && until !== null;
  const remaining = open ? formatClock(until - now) : null;

  const label =
    phase === "linked"
      ? "원격 연결됨"
      : phase === "signaled"
        ? "세션 전달됨"
        : phase === "waiting"
          ? "HMI 연결 대기"
          : "원격 연결 꺼짐";

  const hint =
    phase === "linked"
      ? "명령 약 1분 내 반영"
      : phase === "signaled"
        ? "HMI 명령 조회 확인 중"
        : phase === "waiting"
          ? "다음 정기 보고 때 연결 · 최대 약 10분"
          : "명령을 보내거나 버튼을 누르면 15분간 연결";

  return (
    <div
      className={`remote-session-status remote-session-status--${phase}`}
      role="status"
      aria-live="polite"
      aria-busy={phase === "waiting" || phase === "signaled"}
      title={hint}
    >
      <div className="remote-session-status-main">
        {phase === "linked" ? (
          <span className="remote-session-dot remote-session-dot--ok" aria-hidden>
            <CheckIcon />
          </span>
        ) : phase === "closed" ? (
          <span className="remote-session-dot remote-session-dot--off" aria-hidden />
        ) : (
          <span className="remote-session-dot remote-session-dot--pulse" aria-hidden />
        )}
        <div className="remote-session-copy">
          <span className="remote-session-label">{label}</span>
          <span className="remote-session-hint">{hint}</span>
          {error ? <span className="remote-session-error">{error}</span> : null}
        </div>
      </div>
      {remaining ? (
        <div
          className={`remote-session-timer${phase === "linked" ? " remote-session-timer--live" : ""}`}
          aria-label={`남은 시간 ${remaining}`}
        >
          <span className="remote-session-timer-label">남은 시간</span>
          <span className="remote-session-timer-value">{remaining}</span>
        </div>
      ) : null}
      <button
        type="button"
        className="remote-session-open-btn"
        onClick={openWindow}
        disabled={busy}
      >
        {busy ? "여는 중…" : open ? "15분 연장" : "원격 연결 열기"}
      </button>
    </div>
  );
}
