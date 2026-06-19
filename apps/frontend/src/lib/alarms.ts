import type { Site } from "../types/site";
import { STATUS_LABEL } from "./deviceStatus";
import { formatLastSeen } from "./lteSignal";

export type AlarmItem = {
  id: string;
  siteId: string;
  siteName: string;
  instLabel: string;
  status: "fault" | "offline";
  detail: string;
  sortKey: number;
  ackKey: string;
};

export function alarmAckKey(installationId: string, status: "fault" | "offline") {
  return `${installationId}:${status}`;
}

export function buildAlarms(sites: Site[]): AlarmItem[] {
  const items: AlarmItem[] = [];

  for (const site of sites) {
    for (const inst of site.installations) {
      const status = inst.device?.status;
      if (status !== "fault" && status !== "offline") continue;

      const d = inst.device;
      const thdParts = [
        d?.gridCurrentTHDL1,
        d?.gridCurrentTHDL2,
        d?.gridCurrentTHDL3,
      ].filter((v): v is number => v != null && Number.isFinite(v));
      const maxThd = thdParts.length ? Math.max(...thdParts) : null;

      let detail = STATUS_LABEL[status];
      if (status === "offline") {
        detail += d?.lastSeenAt
          ? ` · ${formatLastSeen(d.lastSeenAt)}`
          : " · 수신 없음";
      } else if (maxThd != null) {
        detail += ` · Grid THD 최대 ${maxThd.toFixed(1)}%`;
      }

      items.push({
        id: inst.id,
        siteId: site.id,
        siteName: site.name,
        instLabel: inst.label,
        status,
        detail,
        ackKey: alarmAckKey(inst.id, status),
        sortKey:
          (status === "fault" ? 2 : 1) * 1e15 +
          (d?.lastSeenAt ? Date.parse(d.lastSeenAt) : 0),
      });
    }
  }

  return items.sort((a, b) => b.sortKey - a.sortKey);
}
