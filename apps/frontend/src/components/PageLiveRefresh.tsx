"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWsConnectionState, useWsEvents } from "../hooks/useWsEvents";
import { bindPageRefresh, schedulePageRefresh } from "../lib/pageRefresh";

/** 실시간 연결이 끊겼을 때 대신 새로고침하는 간격 */
const DEFAULT_FALLBACK_SEC = 30;
/**
 * 연결돼 있어도 이 간격으로 한 번 새로고침한다 — 놓친 신호를 메우고,
 * 데이터가 끊긴 장비가 "통신 끊김"으로 바뀌는 것(시간 기준 판정)을 화면에 반영한다.
 */
const SAFETY_REFRESH_MS = 5 * 60 * 1000;

type Props = {
  /** 실시간 연결이 끊겼을 때의 새로고침 간격(초) */
  refreshSec?: number;
  /** If set, WS refresh only when one of these installations updates */
  installationIds?: string[];
  className?: string;
};

/**
 * 화면 데이터 새로고침.
 * - 실시간 연결(WebSocket) 중: 장비 데이터가 들어왔다는 신호(device_updated)가 올 때만 새로고침 + 5분 안전 새로고침.
 *   HMI 는 10~30분마다 보내므로 30초마다 같은 데이터를 다시 받던 것을 없앤다.
 * - 연결이 끊김: 예전처럼 refreshSec 마다 새로고침하고 남은 초를 보여 준다.
 * - 다시 연결되면 끊긴 동안 놓친 것을 한 번 새로고침한다.
 */
export default function PageLiveRefresh({
  refreshSec = DEFAULT_FALLBACK_SEC,
  installationIds,
  className = "",
}: Props) {
  const router = useRouter();
  const { status } = useWsConnectionState();
  const live = status === "connected";
  const [countdown, setCountdown] = useState(refreshSec);
  const countdownRef = useRef(refreshSec);
  const lastRefreshAt = useRef(Date.now());
  const wasLive = useRef(live);
  /** 처음 연결될 때는 방금 받은 화면이라 새로고침하지 않는다 */
  const everLive = useRef(live);

  const triggerRefresh = useCallback(() => {
    schedulePageRefresh(() => {
      countdownRef.current = refreshSec;
      setCountdown(refreshSec);
      lastRefreshAt.current = Date.now();
      router.refresh();
    });
  }, [router, refreshSec]);

  useEffect(() => bindPageRefresh(triggerRefresh), [triggerRefresh]);

  // 끊겼다가 다시 연결되면 한 번 새로고침
  useEffect(() => {
    if (live && !wasLive.current && everLive.current) triggerRefresh();
    if (live) everLive.current = true;
    wasLive.current = live;
  }, [live, triggerRefresh]);

  useEffect(() => {
    countdownRef.current = refreshSec;
    setCountdown(refreshSec);
    const tick = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (live) {
        if (Date.now() - lastRefreshAt.current >= SAFETY_REFRESH_MS) triggerRefresh();
        return;
      }
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) triggerRefresh();
    }, 1000);
    return () => clearInterval(tick);
  }, [triggerRefresh, refreshSec, live]);

  useWsEvents((msg) => {
    if (msg.type !== "device_updated") return;
    if (installationIds && !installationIds.includes(msg.installationId)) {
      return;
    }
    triggerRefresh();
  });

  if (live) {
    return (
      <div className={`page-live-refresh ${className}`.trim()}>
        <div
          className="live-indicator"
          title="실시간 연결 중 — 새 데이터가 들어오면 바로 화면이 바뀝니다"
        >
          <span className="live-dot" />
          <span className="live-label">LIVE</span>
          <span className="live-countdown">실시간</span>
        </div>
      </div>
    );
  }

  const pct = (countdown / refreshSec) * 100;
  const r = 7;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className={`page-live-refresh ${className}`.trim()}>
      <div
        className="live-indicator"
        title={`실시간 연결이 끊겨 ${refreshSec}초마다 새로고침합니다`}
      >
        <span className="live-dot" />
        <span className="live-label">LIVE</span>
        <svg className="live-ring" width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r={r} className="live-ring-track" />
          <circle
            cx="11"
            cy="11"
            r={r}
            className="live-ring-fill"
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={circ / 4}
          />
        </svg>
        <span className="live-countdown">{countdown}s</span>
      </div>
    </div>
  );
}
