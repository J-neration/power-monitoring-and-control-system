import type { FastifyBaseLogger } from "fastify";
import { isCommLost } from "../lib/commStatus.js";
import { prisma } from "../lib/prisma.js";
import type { UserContext } from "../modules/auth/auth.types.js";
import { deriveDeviceStatus } from "./deviceService.js";
import { siteWhereFilter } from "./siteService.js";

/**
 * 관제 알람 동기화. 1분마다 설비 상태를 보고 Alarm 테이블에 발생(행 추가)·해제(clearedAt)를 기록한다.
 * 판정 규칙은 프론트 lib/alarms.ts buildAlarms 와 같다:
 *   - 통신 끊김(마지막 수신 후 30분)이면 comm_lost (다른 상태보다 우선)
 *   - 아니면 장비 상태가 fault / offline 일 때 그 종류 (장비 행이 없으면 offline)
 * 단, 출고검사 현장(NOT_INSPECTION_SITE)은 제외한다.
 * ALARM_SYNC_ENABLED=false 일 때만 멈춘다.
 */

export const ALARM_KINDS = ["fault", "offline", "comm_lost"] as const;
export type AlarmKind = (typeof ALARM_KINDS)[number];

const TICK_MS = 60 * 1000;

/**
 * 출고검사 현장(검사 계정 INSPECTOR 가 묶인 현장)은 알람 대상이 아니다.
 * 검사 장비는 수시로 켜졌다 꺼지므로 관제 알람에 섞이면 안 된다.
 * 현장이 나중에 검사용이 되면 열린 알람은 다음 동기화 때 해제 처리된다.
 */
export const NOT_INSPECTION_SITE = {
  site: { users: { none: { role: "INSPECTOR" as const } } },
};

export type InstallationSnapshot = {
  id: string;
  device: { moduleStatus: number[] | null; lastSeenAt: Date | null } | null;
};

/** 설비 하나의 현재 알람 종류. 알람이 아니면 null. */
export function alarmKindFor(inst: InstallationSnapshot, now = Date.now()): AlarmKind | null {
  const d = inst.device;
  if (d && isCommLost(d.lastSeenAt, now)) return "comm_lost";
  const status = d ? (deriveDeviceStatus(d.moduleStatus ?? undefined) ?? "offline") : "offline";
  if (status === "fault" || status === "offline") return status;
  return null;
}

export type OpenAlarm = { id: number; installationId: string; kind: string };

export type AlarmSyncPlan = {
  /** 새로 발생한 알람 */
  raise: Array<{ installationId: string; kind: AlarmKind }>;
  /** 풀린 알람 (Alarm.id) */
  clear: number[];
};

/** 열린 알람과 현재 상태를 비교해 추가/해제할 것을 고른다. */
export function planAlarmSync(
  installations: InstallationSnapshot[],
  open: OpenAlarm[],
  now = Date.now(),
): AlarmSyncPlan {
  const active = new Map<string, AlarmKind>();
  for (const inst of installations) {
    const kind = alarmKindFor(inst, now);
    if (kind) active.set(`${inst.id}:${kind}`, kind);
  }

  const clear: number[] = [];
  const stillOpen = new Set<string>();
  for (const row of open) {
    const key = `${row.installationId}:${row.kind}`;
    // 같은 키로 열린 행이 중복이면 첫 행만 남기고 닫는다 (자기 치유)
    if (active.has(key) && !stillOpen.has(key)) stillOpen.add(key);
    else clear.push(row.id);
  }

  const raise: AlarmSyncPlan["raise"] = [];
  for (const [key, kind] of active) {
    if (stillOpen.has(key)) continue;
    raise.push({ installationId: key.slice(0, key.length - kind.length - 1), kind });
  }
  raise.sort((a, b) => a.installationId.localeCompare(b.installationId) || a.kind.localeCompare(b.kind));

  return { raise, clear };
}

export async function syncAlarms(now = Date.now()): Promise<AlarmSyncPlan> {
  const [installations, open] = await Promise.all([
    prisma.installation.findMany({
      where: NOT_INSPECTION_SITE,
      select: { id: true, device: { select: { moduleStatus: true, lastSeenAt: true } } },
    }),
    prisma.alarm.findMany({
      where: { clearedAt: null },
      select: { id: true, installationId: true, kind: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const plan = planAlarmSync(installations, open, now);
  if (plan.raise.length === 0 && plan.clear.length === 0) return plan;

  const at = new Date(now);
  await prisma.$transaction([
    ...(plan.clear.length
      ? [prisma.alarm.updateMany({ where: { id: { in: plan.clear } }, data: { clearedAt: at } })]
      : []),
    ...(plan.raise.length
      ? [prisma.alarm.createMany({ data: plan.raise.map((r) => ({ ...r, raisedAt: at })) })]
      : []),
  ]);
  return plan;
}

/* =========================================================
 * 조회·확인 (GET /alarms, POST /alarms/:id/ack, GET /alarms/history)
 * ========================================================= */

/** 화면용 4단계. 해제+확인(cleared_acked)은 이력에서만 보인다. */
export type AlarmState = "active_unacked" | "active_acked" | "cleared_unacked" | "cleared_acked";

export function alarmState(row: { clearedAt: Date | null; ackedAt: Date | null }): AlarmState {
  if (row.clearedAt == null) return row.ackedAt == null ? "active_unacked" : "active_acked";
  return row.ackedAt == null ? "cleared_unacked" : "cleared_acked";
}

/** 로그인 계정이 볼 수 있는 현장 + 출고검사 현장 제외 */
const visibleAlarmWhere = (ctx: UserContext) => ({
  installation: {
    site: { ...siteWhereFilter(ctx), ...NOT_INSPECTION_SITE.site },
  },
});

const alarmSelect = {
  id: true,
  installationId: true,
  kind: true,
  raisedAt: true,
  clearedAt: true,
  ackedAt: true,
  ackedBy: true,
  ackNote: true,
  installation: { select: { label: true, site: { select: { id: true, name: true } } } },
} as const;

type AlarmRow = {
  id: number;
  installationId: string;
  kind: string;
  raisedAt: Date;
  clearedAt: Date | null;
  ackedAt: Date | null;
  ackedBy: string | null;
  ackNote: string | null;
  installation: { label: string; site: { id: string; name: string } };
};

export type AlarmDto = {
  id: number;
  installationId: string;
  installationLabel: string;
  siteId: string;
  siteName: string;
  kind: string;
  state: AlarmState;
  raisedAt: string;
  clearedAt: string | null;
  ackedAt: string | null;
  ackedBy: string | null;
  ackNote: string | null;
};

const toDto = (row: AlarmRow): AlarmDto => ({
  id: row.id,
  installationId: row.installationId,
  installationLabel: row.installation.label,
  siteId: row.installation.site.id,
  siteName: row.installation.site.name,
  kind: row.kind,
  state: alarmState(row),
  raisedAt: row.raisedAt.toISOString(),
  clearedAt: row.clearedAt?.toISOString() ?? null,
  ackedAt: row.ackedAt?.toISOString() ?? null,
  ackedBy: row.ackedBy,
  ackNote: row.ackNote,
});

/** 처리할 게 남은 알람만 (해제+확인 제외). 한도는 화면 보호용. */
const LIST_LIMIT = 500;

export async function listAlarms(ctx: UserContext): Promise<AlarmDto[]> {
  const rows = await prisma.alarm.findMany({
    where: {
      ...visibleAlarmWhere(ctx),
      OR: [{ clearedAt: null }, { ackedAt: null }],
    },
    select: alarmSelect,
    orderBy: { raisedAt: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(toDto);
}

/* =========================================================
 * 점검 중 (설비 단위 알람 보류)
 *   알람 기록은 계속 남기고, 화면이 띠·미확인 수·알람음에서 뺀다.
 * ========================================================= */

export const MAINTENANCE_DAYS = [1, 7, 30] as const;

export type MaintenanceDto = {
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

/** 지금 점검 중인 설비 조건 (기간 지난 건 자동 제외) */
const maintenanceActiveWhere = (now: Date) => ({
  maintenanceSince: { not: null },
  OR: [{ maintenanceUntil: null }, { maintenanceUntil: { gt: now } }],
});

const visibleInstallationWhere = (ctx: UserContext) => ({
  site: { ...siteWhereFilter(ctx), ...NOT_INSPECTION_SITE.site },
});

export async function listMaintenance(ctx: UserContext, now = new Date()): Promise<MaintenanceDto[]> {
  const rows = await prisma.installation.findMany({
    where: { ...visibleInstallationWhere(ctx), ...maintenanceActiveWhere(now) },
    select: {
      id: true,
      label: true,
      maintenanceSince: true,
      maintenanceUntil: true,
      maintenanceBy: true,
      maintenanceNote: true,
      site: { select: { id: true, name: true } },
    },
    orderBy: { maintenanceSince: "desc" },
  });
  return rows.map((r) => ({
    installationId: r.id,
    installationLabel: r.label,
    siteId: r.site.id,
    siteName: r.site.name,
    since: r.maintenanceSince!.toISOString(),
    until: r.maintenanceUntil?.toISOString() ?? null,
    by: r.maintenanceBy,
    note: r.maintenanceNote,
  }));
}

/** 점검 중 설정(덮어쓰기). days=null 이면 해제할 때까지. 범위 밖 설비면 false. */
export async function setMaintenance(
  ctx: UserContext,
  installationId: string,
  days: number | null,
  note: string | null,
  now = new Date(),
): Promise<boolean> {
  const updated = await prisma.installation.updateMany({
    where: { id: installationId, ...visibleInstallationWhere(ctx) },
    data: {
      maintenanceSince: now,
      maintenanceUntil: days == null ? null : new Date(now.getTime() + days * 86_400_000),
      maintenanceBy: ctx.username.slice(0, 64),
      maintenanceNote: note,
    },
  });
  return updated.count === 1;
}

/** 점검 해제. 범위 밖 설비면 false. */
export async function clearMaintenance(ctx: UserContext, installationId: string): Promise<boolean> {
  const updated = await prisma.installation.updateMany({
    where: { id: installationId, ...visibleInstallationWhere(ctx) },
    data: { maintenanceSince: null, maintenanceUntil: null, maintenanceBy: null, maintenanceNote: null },
  });
  return updated.count === 1;
}

export const ACK_NOTE_MAX = 200;

export type AckResult =
  | { ok: true; alarm: AlarmDto }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_acked"; alarm: AlarmDto };

/** 한 건 확인. 이미 확인된 건은 덮어쓰지 않는다 (먼저 확인한 사람 기록 유지). */
export async function ackAlarmById(
  ctx: UserContext,
  id: number,
  note: string | null,
  now = new Date(),
): Promise<AckResult> {
  const where = { id, ...visibleAlarmWhere(ctx) };
  const found = await prisma.alarm.findFirst({ where, select: { id: true } });
  if (!found) return { ok: false, reason: "not_found" };

  const updated = await prisma.alarm.updateMany({
    where: { id, ackedAt: null },
    data: { ackedAt: now, ackedBy: ctx.username.slice(0, 64), ackNote: note },
  });
  const row = await prisma.alarm.findUniqueOrThrow({ where: { id }, select: alarmSelect });
  return updated.count === 1
    ? { ok: true, alarm: toDto(row) }
    : { ok: false, reason: "already_acked", alarm: toDto(row) };
}

export const BULK_ACK_MAX = 500;

/**
 * 여러 건 한 번에 확인. 화면이 보여준 id 만 받는다 — 목록을 본 뒤 새로 생긴 알람이 같이 확인되지 않게.
 * 계정 범위 밖이거나 이미 확인된 건은 조용히 건너뛴다.
 */
export async function ackAlarmsBulk(
  ctx: UserContext,
  ids: number[],
  note: string | null,
  now = new Date(),
): Promise<{ acked: number; alarms: AlarmDto[] }> {
  const where = { id: { in: ids }, ackedAt: null, ...visibleAlarmWhere(ctx) };
  const targets = await prisma.alarm.findMany({ where, select: { id: true } });
  if (targets.length === 0) return { acked: 0, alarms: [] };
  const targetIds = targets.map((t) => t.id);
  const updated = await prisma.alarm.updateMany({
    where: { id: { in: targetIds }, ackedAt: null },
    data: { ackedAt: now, ackedBy: ctx.username.slice(0, 64), ackNote: note },
  });
  const rows = await prisma.alarm.findMany({
    where: { id: { in: targetIds } },
    select: alarmSelect,
  });
  return { acked: updated.count, alarms: rows.map(toDto) };
}

export const HISTORY_MAX_DAYS = 92;
export const HISTORY_MAX_LIMIT = 1000;

/** 기간 안에 발생한 알람 전부 (상태 무관), 최신순. */
export async function alarmHistory(
  ctx: UserContext,
  opts: { from: Date; to: Date; siteId?: string; limit: number },
): Promise<AlarmDto[]> {
  const visible = visibleAlarmWhere(ctx);
  const rows = await prisma.alarm.findMany({
    where: {
      raisedAt: { gte: opts.from, lt: opts.to },
      installation: {
        ...visible.installation,
        ...(opts.siteId ? { siteId: opts.siteId } : {}),
      },
    },
    select: alarmSelect,
    orderBy: { raisedAt: "desc" },
    take: opts.limit,
  });
  return rows.map(toDto);
}

function isDisabled(env: Record<string, string | undefined>): boolean {
  const flag = (env.ALARM_SYNC_ENABLED ?? "").trim().toLowerCase();
  return flag === "0" || flag === "false" || flag === "no" || flag === "off";
}

/** 프로세스 안 타이머. 서버가 뜨면 곧바로 한 번 돌고 이후 1분마다 돈다. */
export function startAlarmSync(log: FastifyBaseLogger): () => void {
  if (isDisabled(process.env)) return () => {};

  let running = false;
  const tick = async () => {
    if (running) return; // 이전 동기화가 아직 돌면 건너뜀 (중복 행 방지)
    running = true;
    try {
      const plan = await syncAlarms();
      if (plan.raise.length || plan.clear.length) {
        log.info({ raised: plan.raise.length, cleared: plan.clear.length }, "alarm sync");
      }
    } catch (error) {
      log.error(error, "alarm sync failed");
    } finally {
      running = false;
    }
  };

  const starter = setTimeout(() => void tick(), 5_000);
  const timer = setInterval(() => void tick(), TICK_MS);
  starter.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(starter);
    clearInterval(timer);
  };
}
