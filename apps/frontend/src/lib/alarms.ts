import type { Site } from "../types/site";
import { STATUS_LABEL } from "./deviceStatus";

export type AlarmItem = {
  id: string;
  siteId: string;
  siteName: string;
  instLabel: string;
  status: "fault" | "offline";
  /** 상대시각 없이 고정된 문구 (hydration 안전) */
  detail: string;
  /** 오프라인일 때 마지막 수신 — UI에서 마운트 후 상대시각으로 표시 */
  lastSeenAt: string | null;
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
      let lastSeenAt: string | null = null;
      if (status === "offline") {
        lastSeenAt = d?.lastSeenAt ?? null;
        if (!lastSeenAt) detail += " · 수신 없음";
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
        lastSeenAt,
        ackKey: alarmAckKey(inst.id, status),
        sortKey:
          (status === "fault" ? 2 : 1) * 1e15 +
          (d?.lastSeenAt ? Date.parse(d.lastSeenAt) : 0),
      });
    }
  }

  return items.sort((a, b) => b.sortKey - a.sortKey);
}
