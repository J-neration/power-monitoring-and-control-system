import type { DeviceStatus, Site } from "../types/site";

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

export function deriveSiteStatus(site: Site): DeviceStatus {
  let worst: DeviceStatus = "running";
  for (const inst of site.installations) {
    const s = inst.device?.status ?? "offline";
    if (STATUS_PRIORITY[s] > STATUS_PRIORITY[worst]) worst = s;
  }
  return worst;
}

export function sortSitesByPriority(sites: Site[]): Site[] {
  return [...sites].sort((a, b) => {
    const diff =
      STATUS_PRIORITY[deriveSiteStatus(b)] -
      STATUS_PRIORITY[deriveSiteStatus(a)];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ko");
  });
}

export type StatusFilter = "all" | "fault" | "offline";

export function siteMatchesFilter(
  site: Site,
  filter: StatusFilter,
): boolean {
  if (filter === "all") return true;
  for (const inst of site.installations) {
    const s = inst.device?.status ?? "offline";
    if (filter === "fault" && s === "fault") return true;
    if (filter === "offline" && s === "offline") return true;
  }
  return false;
}

export function installationMatchesFilter(
  status: DeviceStatus,
  filter: StatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "fault") return status === "fault";
  if (filter === "offline") return status === "offline";
  return true;
}
