/**
 * In-memory active viewer registry.
 *
 * Tracks which users are currently viewing a given device page.
 * Uses a per-viewer TTL so that crashed browsers (no stop call) naturally
 * expire after VIEWER_TTL_MS. The frontend sends a heartbeat every 60 s by
 * re-calling POST /devices/:id/viewing/start, which resets the timestamp.
 *
 * Multi-user: multiple users may view the same device simultaneously.
 * hasActiveViewers() returns true as long as at least one viewer is fresh.
 */

/** How long a viewer entry stays valid without a heartbeat (ms). */
const VIEWER_TTL_MS = 90_000;

/** installationId → (userId → lastPingedAt timestamp) */
const state = new Map<string, Map<string, number>>();

function getOrCreate(installationId: string): Map<string, number> {
  let map = state.get(installationId);
  if (!map) {
    map = new Map();
    state.set(installationId, map);
  }
  return map;
}

/** Register or refresh a viewer. Call on page open and on heartbeat. */
export function startViewing(installationId: string, userId: string): void {
  getOrCreate(installationId).set(userId, Date.now());
}

/** Remove a viewer. Call on page close / tab hidden (after grace period). */
export function stopViewing(installationId: string, userId: string): void {
  const map = state.get(installationId);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) state.delete(installationId);
}

/** Returns true if at least one non-stale viewer is registered. */
export function hasActiveViewers(installationId: string): boolean {
  return getActiveViewerCount(installationId) > 0;
}

/** Returns the count of non-stale viewers. */
export function getActiveViewerCount(installationId: string): number {
  const map = state.get(installationId);
  if (!map) return 0;
  const cutoff = Date.now() - VIEWER_TTL_MS;
  let count = 0;
  for (const ts of map.values()) {
    if (ts > cutoff) count++;
  }
  return count;
}

/** Periodic cleanup — remove entries whose TTL has expired. */
setInterval(() => {
  const cutoff = Date.now() - VIEWER_TTL_MS;
  for (const [installationId, viewers] of state) {
    for (const [userId, ts] of viewers) {
      if (ts <= cutoff) viewers.delete(userId);
    }
    if (viewers.size === 0) state.delete(installationId);
  }
}, 60_000);
