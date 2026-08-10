"use client";

import { useEffect, useState } from "react";
import {
  clearLocalAdminSessionKeeper,
  releaseAdminSessionOnUnload,
  retainAdminSession,
} from "../lib/adminSessionKeeper";

type UseDeviceViewingReturn = {
  /** True while the remote-session banner should be visible. */
  showBanner: boolean;
  dismissBanner: () => void;
};

/**
 * Keeps Installation.adminSessionActive=true while an ADMIN is on the device page.
 *
 * Clears to false only when:
 * - explicit logout (stop-all)
 * - real tab/window close (pagehide, not bfcache / not tab hide)
 *
 * Heartbeats live in a module singleton so React remounts / router.refresh
 * cannot briefly drop the session.
 */
export function useDeviceViewing(
  installationId: string,
  enabled = true,
): UseDeviceViewingReturn {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!enabled || !installationId) {
      return;
    }

    retainAdminSession(installationId);
    setShowBanner(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        retainAdminSession(installationId);
      }
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      // Entering bfcache — keep session; page may come back.
      if (event.persisted) return;
      releaseAdminSessionOnUnload();
      setShowBanner(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      // In-app navigate away: keep DB session + module heartbeat until tab close / logout.
    };
  }, [enabled, installationId]);

  useEffect(() => {
    return () => {
      // Soft cleanup only when hook fully disabled (e.g. role change)
      if (!enabled) clearLocalAdminSessionKeeper();
    };
  }, [enabled]);

  return {
    showBanner,
    dismissBanner: () => setShowBanner(false),
  };
}
