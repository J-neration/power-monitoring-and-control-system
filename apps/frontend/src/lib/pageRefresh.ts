type Refresh = () => void;

const COOLDOWN_MS = 1_000;
const subscribers = new Set<Refresh>();

let lastStarted = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function runScheduled(refresh: Refresh): void {
  pending = null;
  if (isHidden()) return;
  lastStarted = Date.now();
  refresh();
}

/**
 * Coalesce router.refresh() so overlapping RSC fetches are not aborted
 * mid-stream (React then throws "Connection closed").
 * Skips work while the tab is hidden or frozen.
 */
export function schedulePageRefresh(refresh: Refresh): void {
  if (typeof window === "undefined") return;
  if (isHidden()) return;
  if (pending !== null) return;
  const wait = Math.max(0, COOLDOWN_MS - (Date.now() - lastStarted));
  pending = setTimeout(() => runScheduled(refresh), wait);
}

function kickVisibleSubscribers(): void {
  if (isHidden()) return;
  subscribers.forEach((refresh) => schedulePageRefresh(refresh));
}

function ensureVisibilityListener(): void {
  if (visibilityBound || typeof window === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kickVisibleSubscribers();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) kickVisibleSubscribers();
  });
}

/** Refresh once when the tab returns from background or back-forward cache. */
export function bindPageRefresh(refresh: Refresh): () => void {
  subscribers.add(refresh);
  ensureVisibilityListener();
  return () => {
    subscribers.delete(refresh);
  };
}
