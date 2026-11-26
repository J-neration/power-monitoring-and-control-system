/**
 * 서버 알람 (백엔드 Alarm 테이블, GET /alarms) 타입과 화면 규칙.
 * 4단계: 발생+미확인 / 발생+확인 / 해제+미확인 / 해제+확인(이력에서만).
 */
import { ALARM_STATUS_LABEL, type AlarmStatus } from "./alarms";

export type ServerAlarmState =
  | "active_unacked"
  | "active_acked"
  | "cleared_unacked"
  | "cleared_acked";

export type ServerAlarm = {
  id: number;
  installationId: string;
  installationLabel: string;
  siteId: string;
  siteName: string;
  kind: AlarmStatus | string;
  state: ServerAlarmState;
  raisedAt: string;
  clearedAt: string | null;
  ackedAt: string | null;
  ackedBy: string | null;
  ackNote: string | null;
};

/** 점검 중 설비 (GET /alarms 의 maintenance) — 이 설비 알람은 띠·미확인 수·알람음에서 뺀다 */
export type MaintenanceItem = {
  installationId: string;
  installationLabel: string;
  siteId: string;
  siteName: string;
  since: string;
  /** null 이면 해제할 때까지 */
  until: string | null;
  by: string | null;
  note: string | null;
};

export const MAINTENANCE_OPTIONS: Array<{ days: 1 | 7 | 30 | null; label: string }> = [
  { days: 1, label: "1일" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: null, label: "해제할 때까지" },
];

export const ALARM_STATE_LABEL: Record<ServerAlarmState, string> = {
  active_unacked: "발생 · 미확인",
  active_acked: "발생 · 확인됨",
  cleared_unacked: "해제 · 미확인",
  cleared_acked: "해제 · 확인됨",
};

/** 목록 정렬 순서: 처리 급한 것부터 */
const STATE_ORDER: Record<ServerAlarmState, number> = {
  active_unacked: 0,
  cleared_unacked: 1,
  active_acked: 2,
  cleared_acked: 3,
};

const KIND_ORDER: Record<string, number> = { fault: 0, comm_lost: 1, offline: 2 };

export function alarmKindLabel(kind: string): string {
  return ALARM_STATUS_LABEL[kind as AlarmStatus] ?? kind;
}

export function isUnacked(a: ServerAlarm): boolean {
  return a.state === "active_unacked" || a.state === "cleared_unacked";
}

/** 상태 → 종류(이상 > 통신 끊김 > 오프라인) → 최신 발생 순 */
export function sortServerAlarms(list: ServerAlarm[]): ServerAlarm[] {
  return [...list].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
      Date.parse(b.raisedAt) - Date.parse(a.raisedAt),
  );
}

/** 발생 후 경과 또는 지속 시간 "3시간 12분" */
export function formatDuration(fromIso: string, toIso: string | null, now = Date.now()): string {
  const end = toIso ? Date.parse(toIso) : now;
  const mins = Math.max(0, Math.floor((end - Date.parse(fromIso)) / 60_000));
  if (mins < 1) return "1분 미만";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}
