import type { DeviceStatus, Site } from "../types/site";
import { isCommLost } from "./commStatus";

export const STATUS_PRIORITY: Record<DeviceStatus, number> = {
  fault: 4,
  offline: 3,
  start: 2,
  standby: 2,
  running: 1,
};

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  running: "가동",
  standby: "대기",
  start: "기동",
  fault: "이상",
  offline: "오프라인",
};

/** 한글 가나다 + 숫자 인식 (1, 2, 10 순). 목록 위치는 상태와 무관하게 고정. */
const KO_NUMERIC = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});

export function compareKoNumeric(a: string, b: string): number {
  return KO_NUMERIC.compare(a, b);
}

export function deriveSiteStatus(site: Site): DeviceStatus {
  let worst: DeviceStatus = "running";
  for (const inst of site.installations) {
    const s = inst.device?.status ?? "offline";
    if (STATUS_PRIORITY[s] > STATUS_PRIORITY[worst]) worst = s;
  }
  return worst;
}

export function sortSitesByName(sites: Site[]): Site[] {
  return [...sites].sort((a, b) => compareKoNumeric(a.name, b.name));
}

export function sortByLabel<T extends { label: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareKoNumeric(a.label, b.label));
}

/** 관제 자동 순회용: 이상 현장부터 방문. 목록 UI에는 쓰지 않음. */
export function sortSitesByPriority(sites: Site[]): Site[] {
  return [...sites].sort((a, b) => {
    const diff =
      STATUS_PRIORITY[deriveSiteStatus(b)] -
      STATUS_PRIORITY[deriveSiteStatus(a)];
    if (diff !== 0) return diff;
    return compareKoNumeric(a.name, b.name);
  });
}

export type StatusFilter = "all" | "fault" | "offline" | "comm_lost";

export function siteMatchesFilter(
  site: Site,
  filter: StatusFilter,
): boolean {
  if (filter === "all") return true;
  for (const inst of site.installations) {
    const s = inst.device?.status ?? "offline";
    if (filter === "fault" && s === "fault") return true;
    if (filter === "offline" && s === "offline") return true;
    if (filter === "comm_lost" && isCommLost(inst.device?.lastSeenAt)) return true;
  }
  return false;
}

export function installationMatchesFilter(
  status: DeviceStatus,
  filter: StatusFilter,
  commLost = false,
): boolean {
  if (filter === "all") return true;
  if (filter === "fault") return status === "fault";
  if (filter === "offline") return status === "offline";
  if (filter === "comm_lost") return commLost;
  return true;
}

export function siteHasCommLost(site: Site): boolean {
  return site.installations.some((inst) => isCommLost(inst.device?.lastSeenAt));
}
