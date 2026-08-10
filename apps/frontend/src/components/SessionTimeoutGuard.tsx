"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearLocalAdminSessionKeeper } from "../lib/adminSessionKeeper";

/**
 * Idle auto-logout for authenticated web sessions.
 *
 * Industry norms (admin / enterprise):
 * - Idle: often 15–30 min (Okta Admin Console default 15 min; NIST higher AAL)
 * - Absolute max: commonly 8–12 hours (we already use 8h JWT)
 *
 * For SCADA / field-ops monitoring, 15 min is harsh while watching a dashboard.
 * Default here: 2h idle + existing 8h absolute JWT.
 */
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const CHECK_EVERY_MS = 30_000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
];

async function performLogout(): Promise<void> {
  try {
    await fetch("/api/devices/admin-session/stop-all", {
      method: "POST",
      keepalive: true,
    });
  } catch {
    // best-effort
  }
  clearLocalAdminSessionKeeper();
  try {
    await fetch("/api/auth/logout", { method: "POST", keepalive: true });
  } catch {
    // best-effort
  }
}

/**
 * Logs out after IDLE_TIMEOUT_MS with no user activity.
 * Mount once under the authenticated shell.
 */
export default function SessionTimeoutGuard() {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const loggingOutRef = useRef(false);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const logoutIdle = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    await performLogout();
    router.replace("/login?reason=idle");
    router.refresh();
  }, [router]);

  useEffect(() => {
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, markActivity, { passive: true });
    }

    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        // Do not count background time as idle for ops dashboards —
        // absolute JWT (8h) still bounds the session.
        return;
      }
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        void logoutIdle();
      }
    }, CHECK_EVERY_MS);

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, markActivity);
      }
      window.clearInterval(id);
    };
  }, [markActivity, logoutIdle]);

  return null;
}
