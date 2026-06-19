const STORAGE_KEY = "pmcs_alarm_ack_v1";

export type AckStore = Record<string, number>;

export function loadAckStore(): AckStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AckStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAckStore(store: AckStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function ackAlarm(key: string): AckStore {
  const store = loadAckStore();
  store[key] = Date.now();
  saveAckStore(store);
  return store;
}

export function ackAllAlarms(keys: string[]): AckStore {
  const store = loadAckStore();
  const now = Date.now();
  for (const key of keys) store[key] = now;
  saveAckStore(store);
  return store;
}

export function isAlarmAcked(store: AckStore, key: string): boolean {
  return key in store;
}

export function countUnacked(store: AckStore, keys: string[]): number {
  return keys.filter((k) => !isAlarmAcked(store, k)).length;
}
