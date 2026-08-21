import type { DeviceStatus, Site } from "../types/site";
import { STATUS_LABEL } from "./deviceStatus";
import { isCommLost } from "./commStatus";

export type AlarmStatus = "fault" | "offline" | "comm_lost";

export type AlarmItem = {
  id: string;
  siteId: string;
  siteName: string;
  instLabel: string;
  status: AlarmStatus;
  /** 상대시각 없이 고정된 문구 (hydration 안전) */
  detail: string;
  /** 오프라인·통신 끊김일 때 마지막 수신 — UI에서 마운트 후 상대시각으로 표시 */
  lastSeenAt: string | null;
  sortKey: number;
  ackKey: string;
};

export const ALARM_STATUS_LABEL: Record<AlarmStatus, string> = {
  fault: "이상",
  offline: "오프라인",
  comm_lost: "통신 끊김",
};

export function alarmAckKey(installationId: string, status: AlarmStatus) {
  return `${installationId}:${status}`;
}

const RANK: Record<AlarmStatus, number> = {
  fault: 3,
  comm_lost: 2,
  offline: 1,
};

export function buildAlarms(sites: Site[]): AlarmItem[] {
  const items: AlarmItem[] = [];

  for (const site of sites) {
    for (const inst of site.installations) {
      const d = inst.device;
      const processStatus = (d?.status as DeviceStatus | undefined) ?? "offline";
      const commLost = isCommLost(d?.lastSeenAt);

      if (commLost) {
        items.push({
          id: inst.id,
          siteId: site.id,
          siteName: site.name,
          instLabel: inst.label,
          status: "comm_lost",
          detail: `통신 끊김 · 마지막 ${STATUS_LABEL[processStatus]}`,
          lastSeenAt: d?.lastSeenAt ?? null,
          ackKey: alarmAckKey(inst.id, "comm_lost"),
          sortKey:
            RANK.comm_lost * 1e15 +
            (d?.lastSeenAt ? Date.parse(d.lastSeenAt) : 0),
        });
        continue;
      }

      if (processStatus !== "fault" && processStatus !== "offline") continue;

      const thdParts = [
        d?.gridCurrentTHDL1,
        d?.gridCurrentTHDL2,
        d?.gridCurrentTHDL3,
      ].filter((v): v is number => v != null && Number.isFinite(v));
      const maxThd = thdParts.length ? Math.max(...thdParts) : null;

      let detail = STATUS_LABEL[processStatus];
      let lastSeenAt: string | null = null;
      if (processStatus === "offline") {
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
        status: processStatus,
        detail,
        lastSeenAt,
        ackKey: alarmAckKey(inst.id, processStatus),
        sortKey:
          RANK[processStatus] * 1e15 +
          (d?.lastSeenAt ? Date.parse(d.lastSeenAt) : 0),
      });
    }
  }

  return items.sort((a, b) => b.sortKey - a.sortKey);
}
