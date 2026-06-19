"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWsEvents } from "../hooks/useWsEvents";

const DEFAULT_REFRESH_SEC = 30;

type Props = {
  refreshSec?: number;
  /** If set, WS refresh only when one of these installations updates */
  installationIds?: string[];
  className?: string;
};

export default function PageLiveRefresh({
  refreshSec = DEFAULT_REFRESH_SEC,
  installationIds,
  className = "",
}: Props) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(refreshSec);
  const countdownRef = useRef(refreshSec);

  const triggerRefresh = useCallback(() => {
    countdownRef.current = refreshSec;
    setCountdown(refreshSec);
    router.refresh();
  }, [router, refreshSec]);

  useEffect(() => {
    countdownRef.current = refreshSec;
    setCountdown(refreshSec);
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) triggerRefresh();
    }, 1000);
    return () => clearInterval(tick);
  }, [triggerRefresh, refreshSec]);

  useWsEvents((msg) => {
    if (msg.type !== "device_updated") return;
    if (installationIds && !installationIds.includes(msg.installationId)) {
      return;
    }
    triggerRefresh();
  });

  const pct = (countdown / refreshSec) * 100;
  const r = 7;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className={`page-live-refresh ${className}`.trim()}>
      <div className="live-indicator">
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
