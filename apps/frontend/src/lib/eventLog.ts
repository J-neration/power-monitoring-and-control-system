import type { DeviceStatus, Site } from "../types/site";
import { STATUS_LABEL } from "./deviceStatus";
import { isCommLost } from "./commStatus";

export type EventLogKind = "degraded" | "recovered" | "changed";

export type EventLogEntry = {
  id: string;
  at: number;
  installationId: string;
  siteName: string;
  instLabel: string;
  from: DeviceStatus;
  to: DeviceStatus;
  fromCommLost: boolean;
  toCommLost: boolean;
  kind: EventLogKind;
};

type StatusSnapshot = Record<
  string,
  {
    status: DeviceStatus;
    commLost: boolean;
    siteName: string;
    instLabel: string;
  }
>;

const SNAPSHOT_KEY = "pmcs_status_snapshot_v2";
const LOG_KEY = "pmcs_event_log_v1";
const MAX_ENTRIES = 40;

const BAD: DeviceStatus[] = ["fault", "offline"];

function classifyTransition(
  from: DeviceStatus,
  to: DeviceStatus,
  fromCommLost: boolean,
  toCommLost: boolean,
): EventLogKind | null {
  if (from === to && fromCommLost === toCommLost) return null;
  const wasBad = BAD.includes(from) || fromCommLost;
  const isBad = BAD.includes(to) || toCommLost;
  if (!wasBad && isBad) return "degraded";
  if (wasBad && !isBad) return "recovered";
  return "changed";
}

function buildSnapshot(sites: Site[]): StatusSnapshot {
  const snap: StatusSnapshot = {};
  for (const site of sites) {
    for (const inst of site.installations) {
      snap[inst.id] = {
        status: (inst.device?.status as DeviceStatus) ?? "offline",
        commLost: isCommLost(inst.device?.lastSeenAt),
        siteName: site.name,
        instLabel: inst.label,
      };
    }
  }
  return snap;
}

function loadSnapshot(): StatusSnapshot {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as StatusSnapshot) : {};
  } catch {
    return {};
  }
}

function saveSnapshot(snap: StatusSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // ignore
  }
}

export function loadEventLog(): EventLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EventLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEventLog(entries: EventLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

/** Compare new site data with last snapshot; append events and update snapshot. */
export function ingestSiteStatuses(sites: Site[]): EventLogEntry[] {
  const prev = loadSnapshot();
  const next = buildSnapshot(sites);
  const now = Date.now();
  const fresh: EventLogEntry[] = [];

  for (const [id, meta] of Object.entries(next)) {
    const prevMeta = prev[id];
    if (!prevMeta) continue;
    const kind = classifyTransition(
      prevMeta.status,
      meta.status,
      Boolean(prevMeta.commLost),
      meta.commLost,
    );
    if (!kind) continue;
    fresh.push({
      id: `${id}-${now}-${meta.status}-${meta.commLost ? "lost" : "ok"}`,
      at: now,
      installationId: id,
      siteName: meta.siteName,
      instLabel: meta.instLabel,
      from: prevMeta.status,
      to: meta.status,
      fromCommLost: Boolean(prevMeta.commLost),
      toCommLost: meta.commLost,
      kind,
    });
  }

  saveSnapshot(next);

  if (fresh.length === 0) return loadEventLog();

  const merged = [...fresh, ...loadEventLog()]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ENTRIES);
  saveEventLog(merged);
  return merged;
}

/** Seed snapshot on first load without generating spurious events. */
export function seedStatusSnapshot(sites: Site[]): void {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(SNAPSHOT_KEY)) return;
  saveSnapshot(buildSnapshot(sites));
}

export function formatEventTime(at: number): string {
  return new Date(at).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function eventSummary(entry: EventLogEntry): string {
  const base = `${entry.siteName} · ${entry.instLabel}`;
  if (
    entry.from === entry.to &&
    Boolean(entry.fromCommLost) !== Boolean(entry.toCommLost)
  ) {
    return entry.toCommLost
      ? `${base} — ${STATUS_LABEL[entry.to]} · 통신 끊김`
      : `${base} — 통신 복구 · ${STATUS_LABEL[entry.to]}`;
  }
  return `${base} — ${STATUS_LABEL[entry.from]} → ${STATUS_LABEL[entry.to]}`;
}

export const EVENT_KIND_LABEL: Record<EventLogKind, string> = {
  degraded: "악화",
  recovered: "복구",
  changed: "변경",
};
