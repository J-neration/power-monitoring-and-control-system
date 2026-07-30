"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * How long the tab must remain hidden before we call viewing/stop.
 * A short tab-switch (< 30 s) does not cancel active settings session.
 */
const HIDE_GRACE_MS = 30_000;

/**
 * How often to re-call viewing/start as a heartbeat.
 * Backend Settings TTL is 150 s; 60 s keeps the entry fresh.
 */
const HEARTBEAT_INTERVAL_MS = 60_000;

async function callViewingApi(
  installationId: string,
  action: "start" | "stop",
): Promise<void> {
  try {
    await fetch(
      `/api/devices/${encodeURIComponent(installationId)}/viewing/${action}`,
      {
        method: "POST",
        // keepalive so the request survives page unload (stop on navigate-away)
        keepalive: true,
      },
    );
  } catch {
    // best-effort — network errors are acceptable here
  }
}

type UseDeviceViewingReturn = {
  /** True while the Settings-sync banner should be visible. */
  showBanner: boolean;
  /** Call to manually hide the banner (also called automatically after timeout). */
  dismissBanner: () => void;
};

/**
 * Manages webSettingsActive for the Device Settings tab.
 *
 * Only runs while `enabled` is true (Settings tab selected).
 * - start on enable / tab visible again
 * - stop on disable / unmount / hide beyond grace
 * - heartbeat every 60 s
 */
export function useDeviceViewing(
  installationId: string,
  enabled = true,
): UseDeviceViewingReturn {
  const [showBanner, setShowBanner] = useState(false);

  const isActiveRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startViewing = useCallback(() => {
    if (isActiveRef.current) return;
    isActiveRef.current = true;

    callViewingApi(installationId, "start");
    setShowBanner(true);

    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      callViewingApi(installationId, "start");
    }, HEARTBEAT_INTERVAL_MS);
  }, [installationId, clearHeartbeat]);

  const stopViewing = useCallback(() => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;

    callViewingApi(installationId, "stop");
    clearHeartbeat();
    setShowBanner(false);
  }, [installationId, clearHeartbeat]);

  const dismissBanner = useCallback(() => setShowBanner(false), []);

  useEffect(() => {
    if (!enabled) {
      clearHideTimer();
      clearHeartbeat();
      stopViewing();
      return;
    }

    startViewing();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearHideTimer();
        startViewing();
      } else {
        if (hideTimerRef.current !== null) return;
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          stopViewing();
        }, HIDE_GRACE_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearHideTimer();
      clearHeartbeat();
      stopViewing();
    };
  }, [
    enabled,
    startViewing,
    stopViewing,
    clearHideTimer,
    clearHeartbeat,
  ]);

  return { showBanner, dismissBanner };
}
