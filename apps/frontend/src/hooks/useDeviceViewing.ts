"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * How long the tab must remain hidden before we clear adminSessionActive.
 * Short — leaving the remote UI should release the HMI poll gate without logout.
 */
const HIDE_GRACE_MS = 10_000;

/**
 * Heartbeat interval. Backend TTL is 90 s; 45 s keeps the entry fresh while on page.
 */
const HEARTBEAT_INTERVAL_MS = 45_000;

function callViewingApi(
  installationId: string,
  action: "start" | "stop",
): void {
  try {
    void fetch(
      `/api/devices/${encodeURIComponent(installationId)}/viewing/${action}`,
      {
        method: "POST",
        // keepalive so stop survives page unload / client navigation
        keepalive: true,
      },
    );
  } catch {
    // best-effort
  }
}

type UseDeviceViewingReturn = {
  /** True while the remote-session banner should be visible. */
  showBanner: boolean;
  /** Hide the waiting banner only (does not end the admin session). */
  dismissBanner: () => void;
};

/**
 * Keeps Installation.adminSessionActive=true while an ADMIN is on the device page.
 *
 * Clears to false automatically when:
 * - leaving the device page (unmount / client navigate)
 * - tab/window hidden beyond grace
 * - pagehide / beforeunload
 * - heartbeat TTL expires on the server (no logout required)
 *
 * HMI learns false on the next POST /receiver ACK (up to ~10 min).
 */
export function useDeviceViewing(
  installationId: string,
  enabled = true,
): UseDeviceViewingReturn {
  const [showBanner, setShowBanner] = useState(false);

  const isActiveRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const installationIdRef = useRef(installationId);
  installationIdRef.current = installationId;

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
    if (isActiveRef.current) {
      // Refresh heartbeat even if already marked active locally
      callViewingApi(installationId, "start");
      return;
    }
    isActiveRef.current = true;

    callViewingApi(installationId, "start");
    setShowBanner(true);

    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      callViewingApi(installationId, "start");
    }, HEARTBEAT_INTERVAL_MS);
  }, [installationId, clearHeartbeat]);

  /** Always POSTs stop so DB clears even if local ref was out of sync. */
  const stopViewing = useCallback(
    (opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      if (!force && !isActiveRef.current) return;
      isActiveRef.current = false;
      callViewingApi(installationId, "stop");
      clearHeartbeat();
      setShowBanner(false);
    },
    [installationId, clearHeartbeat],
  );

  const dismissBanner = useCallback(() => setShowBanner(false), []);

  useEffect(() => {
    if (!enabled) {
      clearHideTimer();
      clearHeartbeat();
      stopViewing({ force: true });
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
          stopViewing({ force: true });
        }, HIDE_GRACE_MS);
      }
    };

    // bfcache / tab close / navigate away — clear session without logout
    const handlePageHide = () => {
      clearHideTimer();
      isActiveRef.current = false;
      clearHeartbeat();
      callViewingApi(installationIdRef.current, "stop");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      clearHideTimer();
      clearHeartbeat();
      // Always clear DB when leaving the device page
      stopViewing({ force: true });
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
