"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * How long the tab must remain hidden before we call viewing/stop.
 * A short tab-switch (< 30 s) does not cancel active viewing,
 * which prevents stop/start churn and banner re-pop spam.
 */
const HIDE_GRACE_MS = 30_000;

/**
 * How often to re-call viewing/start as a heartbeat.
 * The backend TTL is 90 s; 60 s keeps the entry comfortably fresh
 * and aligns with the HMI command-poll interval.
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
  /** True while the "up-to-60-second refresh" banner should be visible. */
  showBanner: boolean;
  /** Call to manually hide the banner (also called automatically after timeout). */
  dismissBanner: () => void;
};

/**
 * Manages active-viewing state for a device detail page.
 *
 * Behaviour:
 * - Calls viewing/start on mount and whenever the tab becomes visible again
 *   after having been stopped (visibility hidden > HIDE_GRACE_MS).
 * - Calls viewing/stop on unmount and after HIDE_GRACE_MS of tab being hidden.
 * - Sends a heartbeat every HEARTBEAT_INTERVAL_MS to keep the server TTL fresh.
 * - Prevents duplicate start/stop calls via isActiveRef.
 * - Exposes showBanner / dismissBanner for a one-time informational banner.
 */
export function useDeviceViewing(
  installationId: string,
): UseDeviceViewingReturn {
  const [showBanner, setShowBanner] = useState(false);

  /**
   * Tracks whether the server currently believes this client is an active viewer.
   * Using a ref (not state) so that start/stop callbacks do not need to be
   * re-created on every render.
   */
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
    if (isActiveRef.current) return; // already active — no duplicate call
    isActiveRef.current = true;

    callViewingApi(installationId, "start");
    setShowBanner(true);

    // Periodic heartbeat to refresh the server-side TTL
    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      callViewingApi(installationId, "start");
    }, HEARTBEAT_INTERVAL_MS);
  }, [installationId, clearHeartbeat]);

  const stopViewing = useCallback(() => {
    if (!isActiveRef.current) return; // already inactive — no duplicate call
    isActiveRef.current = false;

    callViewingApi(installationId, "stop");
    clearHeartbeat();
  }, [installationId, clearHeartbeat]);

  const dismissBanner = useCallback(() => setShowBanner(false), []);

  useEffect(() => {
    // Page mount — begin active viewing
    startViewing();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab became visible — cancel any pending stop and (re-)start viewing
        clearHideTimer();
        startViewing();
      } else {
        // Tab hidden — wait for the grace period before stopping.
        // If the user comes back within HIDE_GRACE_MS the timer is cancelled
        // and viewing is never interrupted.
        if (hideTimerRef.current !== null) return; // timer already running
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          stopViewing();
        }, HIDE_GRACE_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Page unmount (navigation away, tab close, logout redirect)
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearHideTimer();
      clearHeartbeat();
      stopViewing();
    };
  }, [startViewing, stopViewing, clearHideTimer, clearHeartbeat]);

  return { showBanner, dismissBanner };
}
