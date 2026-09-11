const STORAGE_KEY = "pmcs_watch_ack_v1";

/** installationId → dismissed anomaly codes */
export type WatchAckStore = Record<string, string[]>;

export function loadWatchAckStore(): WatchAckStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WatchAckStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWatchAckStore(store: WatchAckStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function dismissedCodesFor(
  store: WatchAckStore,
  installationId: string,
): string[] {
  const codes = store[installationId];
  return Array.isArray(codes) ? codes : [];
}

export function dismissWatchAlert(
  installationId: string,
  code: string,
): WatchAckStore {
  const store = loadWatchAckStore();
  const prev = dismissedCodesFor(store, installationId);
  if (!prev.includes(code)) store[installationId] = [...prev, code];
  saveWatchAckStore(store);
  return store;
}

export function dismissAllWatchAlerts(
  installationId: string,
  codes: string[],
): WatchAckStore {
  const store = loadWatchAckStore();
  const prev = dismissedCodesFor(store, installationId);
  store[installationId] = [...new Set([...prev, ...codes])];
  saveWatchAckStore(store);
  return store;
}

export function restoreWatchAlerts(installationId: string): WatchAckStore {
  const store = loadWatchAckStore();
  delete store[installationId];
  saveWatchAckStore(store);
  return store;
}

/** Drop codes that are no longer present so a later recurrence shows again. */
export function pruneWatchAck(
  installationId: string,
  activeCodes: string[],
): WatchAckStore {
  const store = loadWatchAckStore();
  const prev = dismissedCodesFor(store, installationId);
  if (prev.length === 0) return store;
  const keep = prev.filter((code) => activeCodes.includes(code));
  if (keep.length === prev.length) return store;
  if (keep.length === 0) delete store[installationId];
  else store[installationId] = keep;
  saveWatchAckStore(store);
  return store;
}
