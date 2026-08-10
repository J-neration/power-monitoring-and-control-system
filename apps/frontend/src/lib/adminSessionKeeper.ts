/**
 * Module-level admin remote-session keeper.
 * Survives React remounts; only clears on logout / real tab close.
 */

const HEARTBEAT_INTERVAL_MS = 45_000;

type Entry = {
  installationId: string;
  heartbeat: ReturnType<typeof setInterval> | null;
  /** ISO time of last successful start intent (for stop race guard). */
  lastStartAt: string;
};

let active: Entry | null = null;

function postViewing(
  installationId: string,
  action: "start" | "stop",
  body?: Record<string, string>,
): void {
  try {
    void fetch(
      `/api/devices/${encodeURIComponent(installationId)}/viewing/${action}`,
      {
        method: "POST",
        keepalive: true,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
    );
  } catch {
    // best-effort
  }
}

/** Start or refresh adminSessionActive for this installation. */
export function retainAdminSession(installationId: string): void {
  if (!installationId) return;

  if (active && active.installationId !== installationId) {
    // Switching devices: keep previous true until logout/tab close (product choice),
    // but move heartbeat to the page the admin is actually on.
    if (active.heartbeat) clearInterval(active.heartbeat);
    active = null;
  }

  const nowIso = new Date().toISOString();
  if (!active) {
    active = {
      installationId,
      heartbeat: null,
      lastStartAt: nowIso,
    };
    postViewing(installationId, "start");
    active.heartbeat = setInterval(() => {
      if (!active || active.installationId !== installationId) return;
      active.lastStartAt = new Date().toISOString();
      postViewing(installationId, "start");
    }, HEARTBEAT_INTERVAL_MS);
    return;
  }

  active.lastStartAt = nowIso;
  postViewing(installationId, "start");
  if (!active.heartbeat) {
    active.heartbeat = setInterval(() => {
      if (!active || active.installationId !== installationId) return;
      active.lastStartAt = new Date().toISOString();
      postViewing(installationId, "start");
    }, HEARTBEAT_INTERVAL_MS);
  }
}

/**
 * Clear adminSessionActive for the active installation (tab close).
 * Sends notAfter so a newer start cannot be overwritten by a late stop.
 */
export function releaseAdminSessionOnUnload(): void {
  if (!active) return;
  const { installationId, lastStartAt, heartbeat } = active;
  if (heartbeat) clearInterval(heartbeat);
  active = null;
  postViewing(installationId, "stop", { notAfter: lastStartAt });
}

/** Logout: local timer stop; server stop-all is called separately. */
export function clearLocalAdminSessionKeeper(): void {
  if (!active?.heartbeat) {
    active = null;
    return;
  }
  clearInterval(active.heartbeat);
  active = null;
}

export function getActiveAdminSessionInstallationId(): string | null {
  return active?.installationId ?? null;
}
