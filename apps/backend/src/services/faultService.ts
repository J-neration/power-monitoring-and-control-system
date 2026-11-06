import { getInstallationIdByIccid, normalizeIccid } from "./deviceService.js";
import { prisma } from "../lib/prisma.js";

export type FaultInput = {
  module: number;
  /** 없으면 빈 문자열 저장 (페이로드 축소용) */
  desc?: string;
};

/** POST /receiver/faults* 본문의 fault 항목 */
export type ReceiverFaultUpsertInput = {
  faultCode: number;
  event: "RAISE" | "CLEAR";
  /** HMI 가 보내는 사람이 읽을 수 있는 이름 (예: Over Temperature) */
  eventName?: string | null;
};

const normalizeEventNameForDb = (v: string | null | undefined): string | null => {
  if (v === undefined || v === null) return null;
  const t = v.trim().slice(0, 64);
  return t.length > 0 ? t : null;
};

const eventNamePatch = (fault: ReceiverFaultUpsertInput) =>
  fault.eventName === undefined
    ? {}
    : { eventName: normalizeEventNameForDb(fault.eventName) };

/**
 * CLEAR 뒤 이 시간 안에 같은 모듈 RAISE 가 오면 해제가 아니라 코드 갱신으로 본다.
 * HMI 는 fault 중 코드가 바뀌면 CLEAR·RAISE 를 같은 배치로 보내므로 실제 간격은 수 ms 다.
 */
const CODE_UPDATE_GAP_MS = 2000;

type FaultListRow = {
  id: string;
  module: number;
  desc: string;
  occurredAt: Date;
  installationId: string;
  eventName?: string | null;
  /** 현재 활성(빨강) 여부 — RAISE 상태 + 미확인 */
  active: boolean;
  /** 이 건이 끝난 시각 (해제 또는 갱신). 없으면 진행 중 */
  resolvedAt?: Date | null;
  /** 끝난 이유 — cleared: HMI 해제, updated: 풀리지 않은 채 새 코드로 갱신 */
  endReason?: "cleared" | "updated" | null;
  acknowledgedAt?: Date | null;
};

/**
 * LTE POST가 `lte-{iccid}` 설치에만 쌓이고, UI는 레지스트리 설치 ID(예: prime-rnd-lab-1)를 쓰는 경우를 합침.
 * - Installation.iccid 가 있으면 동일 ICCID용 자동 id `lte-{iccid}` 포함
 * - 과거 FaultEvent 에 iccid 가 남아 있으면 그 ICCID로 매핑된 설치 ID 포함
 */
const installationIdsForModuleFaultState = async (
  installationId: string,
): Promise<string[]> => {
  const inst = await prisma.installation.findUnique({
    where: { id: installationId },
    select: { iccid: true, siteId: true },
  });
  const ids = new Set<string>([installationId]);
  if (inst?.iccid) {
    const norm = normalizeIccid(inst.iccid);
    if (norm) ids.add(`lte-${norm}`);
  }
  /**
   * 레지스트리 설치(prime-rnd-lab-1)에는 iccid 없이, POST /receiver/faults 만으로 `unknown` 사이트의
   * `lte-{iccid}` 설치만 생긴 경우 — 같은 site에 lte- 설치가 **한 개뿐**이면 그 id 를 합침.
   */
  if (!inst?.iccid && inst?.siteId) {
    const lteOnSite = await prisma.installation.findMany({
      where: { siteId: inst.siteId, id: { startsWith: "lte-" } },
      select: { id: true },
    });
    if (lteOnSite.length === 1) {
      ids.add(lteOnSite[0].id);
    }
  }
  const fromEvents = await prisma.faultEvent.findMany({
    where: { installationId, iccid: { not: null } },
    distinct: ["iccid"],
    select: { iccid: true },
  });
  for (const row of fromEvents) {
    if (!row.iccid) continue;
    const resolved = await getInstallationIdByIccid(row.iccid);
    if (resolved) ids.add(resolved);
  }
  return [...ids];
};

/** installationId 목록 + (있으면) 동일 ICCID 설치(예: lte-*) 조건. 대상이 없으면 null */
const moduleFaultWhere = (
  stateIds: string[],
  iccid: string | null | undefined,
) => {
  const norm = iccid ? normalizeIccid(iccid) : "";
  if (stateIds.length === 0 && !norm) {
    return null;
  }
  return norm.length > 0
    ? {
        OR: [
          ...(stateIds.length > 0 ? [{ installationId: { in: stateIds } }] : []),
          { installation: { iccid: norm } },
        ],
      }
    : { installationId: { in: stateIds } };
};

/** installationId 목록 + (있으면) 동일 ICCID 설치(예: lte-*)의 ModuleFaultState 까지 */
const fetchModuleFaultStatesForInstallations = async (
  stateIds: string[],
  iccid: string | null | undefined,
) => {
  const where = moduleFaultWhere(stateIds, iccid);
  if (!where) return [];

  const rows = await prisma.moduleFaultState.findMany({
    where,
    select: {
      id: true,
      installationId: true,
      faultCode: true,
      updatedAt: true,
      lastEvent: true,
      repeatCount: true,
      resolvedAt: true,
      criticalChannel: true,
      eventName: true,
      acknowledgedAt: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...byId.values()];
};

/** 같은 대상의 ModuleFaultLog 최근 take 건 (수신 순서 오름차순으로 돌려준다) */
const fetchModuleFaultLogsForInstallations = async (
  stateIds: string[],
  iccid: string | null | undefined,
  take: number,
) => {
  const where = moduleFaultWhere(stateIds, iccid);
  if (!where) return [];
  const rows = await prisma.moduleFaultLog.findMany({
    where,
    orderBy: { id: "desc" },
    take,
    select: {
      id: true,
      installationId: true,
      faultCode: true,
      event: true,
      eventName: true,
      occurredAt: true,
    },
  });
  return rows.reverse();
};

/** 동일 ICCID로 `lte-*` 와 레지스트리 설치에 중복 행이 있으면 faultCode 당 최신 한 건만 */
const dedupeModuleStatesByFaultCode = <
  T extends { faultCode: number; updatedAt: Date },
>(
  states: T[],
): T[] => {
  const sorted = [...states].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const map = new Map<number, T>();
  for (const s of sorted) {
    if (!map.has(s.faultCode)) map.set(s.faultCode, s);
  }
  return [...map.values()];
};

/**
 * ModuleFaultState 한 행이 현재 "활성"인지 판정.
 * 활성 = 마지막 이벤트가 RAISE && 사용자 미확인.
 * HMI 는 상태가 바뀔 때만 보내므로 시간이 지났다고 자동 해제하지 않는다 — CLEAR 나 확인으로만 꺼진다.
 */
const isModuleStateActive = (s: {
  lastEvent: string;
  acknowledgedAt: Date | null;
}): boolean => s.lastEvent === "RAISE" && s.acknowledgedAt == null;

type ModuleStateRow = {
  id: string;
  installationId: string;
  faultCode: number;
  updatedAt: Date;
  lastEvent: string;
  repeatCount: number;
  resolvedAt: Date | null;
  criticalChannel: boolean;
  eventName: string | null;
  acknowledgedAt: Date | null;
};

type ModuleLogRow = {
  id: number;
  installationId: string;
  faultCode: number;
  event: string;
  eventName: string | null;
  occurredAt: Date;
};

/**
 * ModuleFaultLog 를 모듈별 발생 건으로 묶는다. RAISE 가 한 건을 열고 다음 CLEAR 가 닫는다.
 * - CLEAR 바로 뒤(CODE_UPDATE_GAP_MS 안)에 같은 모듈 RAISE 가 오면 해제가 아니라 "갱신"이다.
 *   (HMI 는 fault 중 코드가 바뀌면 CLEAR·RAISE 를 함께 보낸다)
 * - CLEAR 없이 RAISE 가 또 와도 앞 건은 "갱신"으로 닫는다.
 * - 앞 RAISE 없이 온 CLEAR 는 버린다 (로그 조회 범위 밖에서 시작한 건).
 * - 모듈마다 가장 최근 건에만 현재 상태(활성·확인)를 붙인다.
 */
const buildOccurrenceRows = (
  logs: ModuleLogRow[],
  stateByCode: Map<number, ModuleStateRow>,
): FaultListRow[] => {
  const byCode = new Map<number, FaultListRow[]>();
  const open = new Map<number, FaultListRow>();
  /** 방금 CLEAR 로 닫힌 건 — 곧 RAISE 가 따라오면 "갱신"으로 바꾼다 */
  const justCleared = new Map<number, FaultListRow>();
  for (const log of logs) {
    const list = byCode.get(log.faultCode) ?? [];
    byCode.set(log.faultCode, list);
    if (log.event === "RAISE") {
      const prevOpen = open.get(log.faultCode);
      if (prevOpen) {
        prevOpen.resolvedAt = log.occurredAt;
        prevOpen.endReason = "updated";
      }
      const cleared = justCleared.get(log.faultCode);
      if (
        cleared?.resolvedAt &&
        log.occurredAt.getTime() - cleared.resolvedAt.getTime() <= CODE_UPDATE_GAP_MS
      ) {
        cleared.endReason = "updated";
      }
      justCleared.delete(log.faultCode);
      const row: FaultListRow = {
        id: `mfl-${log.id}`,
        module: log.faultCode - 1,
        desc: "",
        occurredAt: log.occurredAt,
        installationId: log.installationId,
        eventName: log.eventName,
        active: false,
        resolvedAt: null,
        endReason: null,
        acknowledgedAt: null,
      };
      list.push(row);
      open.set(log.faultCode, row);
      continue;
    }
    const row = open.get(log.faultCode);
    if (row) {
      row.resolvedAt = log.occurredAt;
      row.endReason = "cleared";
      open.delete(log.faultCode);
      justCleared.set(log.faultCode, row);
    }
  }

  const rows: FaultListRow[] = [];
  for (const [faultCode, list] of byCode) {
    const latest = list[list.length - 1];
    const state = stateByCode.get(faultCode);
    if (latest && state) {
      if (open.get(faultCode) === latest) {
        latest.active = isModuleStateActive(state);
      }
      if (
        state.acknowledgedAt &&
        state.acknowledgedAt.getTime() >= latest.occurredAt.getTime()
      ) {
        latest.acknowledgedAt = state.acknowledgedAt;
      }
    }
    rows.push(...list);
  }
  return rows;
};

const mergeFaultLists = (
  events: Array<{
    id: string;
    module: number;
    desc: string;
    occurredAt: Date;
    installationId: string;
  }>,
  states: ModuleStateRow[],
  logs: ModuleLogRow[],
  limit: number,
): FaultListRow[] => {
  // 순수 이력(FaultEvent)은 과거 로그이므로 항상 비활성으로 둔다.
  const eventRows: FaultListRow[] = events.map((e) => ({
    ...e,
    eventName: null,
    active: false,
    resolvedAt: null,
    acknowledgedAt: null,
  }));
  const stateByCode = new Map(states.map((s) => [s.faultCode, s]));
  const fromLog = buildOccurrenceRows(logs, stateByCode);
  // 로그가 생기기 전(마이그레이션 이전)에 들어온 모듈은 현재 상태 한 줄로만 보여준다.
  const loggedCodes = new Set(logs.map((l) => l.faultCode));
  const fromState: FaultListRow[] = states
    .filter((s) => !loggedCodes.has(s.faultCode))
    .map((s) => ({
      id: `mfs-${s.id}`,
      module: s.faultCode - 1,
      desc: "",
      occurredAt: s.updatedAt,
      installationId: s.installationId,
      eventName: s.eventName,
      active: isModuleStateActive(s),
      resolvedAt: s.resolvedAt,
      endReason: s.resolvedAt ? ("cleared" as const) : null,
      acknowledgedAt: s.acknowledgedAt,
    }));
  return [...eventRows, ...fromLog, ...fromState]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, limit);
};

/** 같은 모듈·같은 설명이 이 시간 안에 이미 있으면 메일을 다시 보내지 않는다. */
export const IDENTICAL_FAULT_QUIET_MS = 60 * 60 * 1000;

export const faultService = {
  /** 활성 RAISE 가 이미 있으면 false. 없거나 CLEAR 이후면 true. */
  isNewFaultRaise: async (installationId: string, faultCode: number): Promise<boolean> => {
    const row = await prisma.moduleFaultState.findUnique({
      where: { installationId_faultCode: { installationId, faultCode } },
      select: { lastEvent: true },
    });
    return row?.lastEvent !== "RAISE";
  },

  hasRecentIdenticalFault: async (params: {
    installationId: string;
    module: number;
    desc?: string;
    withinMs?: number;
  }): Promise<boolean> => {
    const desc = (params.desc ?? "").trim().slice(0, 48);
    const row = await prisma.faultEvent.findFirst({
      where: {
        installationId: params.installationId,
        module: params.module,
        desc,
        occurredAt: {
          gte: new Date(Date.now() - (params.withinMs ?? IDENTICAL_FAULT_QUIET_MS)),
        },
      },
      select: { id: true },
    });
    return row != null;
  },

  /** HMI POST /receiver 에서 faults 배열이 있을 때 일괄 저장 */
  saveFaults: async (params: {
    installationId: string;
    iccid?: string | null;
    faults: FaultInput[];
    occurredAt?: Date;
  }): Promise<void> => {
    if (params.faults.length === 0) return;
    const now = params.occurredAt ?? new Date();
    await prisma.faultEvent.createMany({
      data: params.faults.map((f) => ({
        installationId: params.installationId,
        iccid: params.iccid ?? null,
        module: f.module,
        desc: (f.desc ?? "").trim().slice(0, 48),
        occurredAt: now,
      })),
    });
  },

  /** GET /receiver/faults — iccid 또는 installationId로 최근 N건 조회 */
  getFaults: async (params: {
    iccid?: string;
    installationId?: string;
    limit?: number;
  }) => {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    /** 발생 한 건 = RAISE + CLEAR 두 줄이므로 로그는 두 배를 읽는다. */
    const logTake = limit * 2;
    const selectEvent = {
      id: true,
      module: true,
      desc: true,
      occurredAt: true,
      installationId: true,
    } as const;

    if (params.iccid) {
      const norm = normalizeIccid(params.iccid);
      const [events, instId] = await Promise.all([
        norm
          ? prisma.faultEvent.findMany({
              where: { iccid: norm },
              orderBy: { occurredAt: "desc" },
              take: limit,
              select: selectEvent,
            })
          : Promise.resolve([]),
        norm ? getInstallationIdByIccid(norm) : Promise.resolve(null),
      ]);
      const stateIds = instId
        ? await installationIdsForModuleFaultState(instId)
        : [];
      const instRow = instId
        ? await prisma.installation.findUnique({
            where: { id: instId },
            select: { iccid: true },
          })
        : null;
      const iccidForMerge = instRow?.iccid ?? norm;
      const [rawStates, logs] = await Promise.all([
        fetchModuleFaultStatesForInstallations(stateIds, iccidForMerge),
        fetchModuleFaultLogsForInstallations(stateIds, iccidForMerge, logTake),
      ]);
      const states = dedupeModuleStatesByFaultCode(rawStates);
      return mergeFaultLists(events, states, logs, limit);
    }

    if (params.installationId) {
      const stateIds = await installationIdsForModuleFaultState(
        params.installationId,
      );
      const instRow = await prisma.installation.findUnique({
        where: { id: params.installationId },
        select: { iccid: true },
      });
      const [events, rawStates, logs] = await Promise.all([
        prisma.faultEvent.findMany({
          where: { installationId: params.installationId },
          orderBy: { occurredAt: "desc" },
          take: limit,
          select: selectEvent,
        }),
        fetchModuleFaultStatesForInstallations(stateIds, instRow?.iccid),
        fetchModuleFaultLogsForInstallations(stateIds, instRow?.iccid, logTake),
      ]);
      return mergeFaultLists(
        events,
        dedupeModuleStatesByFaultCode(rawStates),
        logs,
        limit,
      );
    }

    return [];
  },

  /**
   * POST /receiver/faults* — Modbus faultCode(1–6)당 한 행 upsert + ModuleFaultLog 한 줄 추가.
   * 시각은 DB `updatedAt`(갱신 시각)과 CLEAR 시 `resolvedAt`(서버 수신 시각)만 사용.
   *
   * TODO(HMI): HMI remote_fault_batch.c 는 4초 배치 안에서 (faultCode, RAISE/CLEAR) 키당 한 줄만
   * 남긴다. 같은 모듈이 4초 안에 두 번 이상 바뀌면(예: RAISE F11 → 코드 변경 CLEAR → RAISE F3)
   * 뒤 RAISE 가 빠져 서버는 해제로 보게 된다. HMI 쪽에서 중복 키를 버리지 말고 순서대로 쌓도록 고쳐야 한다.
   */
  upsertReceiverFaultState: async (params: {
    installationId: string;
    fault: ReceiverFaultUpsertInput;
    criticalChannel?: boolean;
  }) => {
    const { installationId, fault, criticalChannel = false } = params;

    const enCreate = normalizeEventNameForDb(fault.eventName);

    // 상태(덮어쓰기)와 이력 로그(추가)를 한 트랜잭션으로 남긴다.
    const log = prisma.moduleFaultLog.create({
      data: {
        installationId,
        faultCode: fault.faultCode,
        event: fault.event,
        eventName: enCreate,
        criticalChannel,
      },
    });

    if (fault.event === "RAISE") {
      const [state] = await prisma.$transaction([
        prisma.moduleFaultState.upsert({
          where: {
            installationId_faultCode: { installationId, faultCode: fault.faultCode },
          },
          create: {
            installationId,
            faultCode: fault.faultCode,
            repeatCount: 1,
            resolvedAt: null,
            lastEvent: "RAISE",
            criticalChannel,
            eventName: enCreate,
          },
          update: {
            repeatCount: { increment: 1 },
            resolvedAt: null,
            lastEvent: "RAISE",
            // 재발생 시 이전 확인(Acknowledge) 무효화 → 다시 활성으로 표시
            acknowledgedAt: null,
            acknowledgedBy: null,
            ...(criticalChannel ? { criticalChannel: true } : {}),
            ...eventNamePatch(fault),
          },
        }),
        log,
      ]);
      return state;
    }

    const now = new Date();
    const [state] = await prisma.$transaction([
      prisma.moduleFaultState.upsert({
        where: {
          installationId_faultCode: { installationId, faultCode: fault.faultCode },
        },
        create: {
          installationId,
          faultCode: fault.faultCode,
          repeatCount: 1,
          resolvedAt: now,
          lastEvent: "CLEAR",
          criticalChannel,
          eventName: enCreate,
        },
        update: {
          repeatCount: { increment: 1 },
          resolvedAt: now,
          lastEvent: "CLEAR",
          ...(criticalChannel ? { criticalChannel: true } : {}),
          ...eventNamePatch(fault),
        },
      }),
      log,
    ]);
    return state;
  },

  /**
   * 사용자(Admin) Acknowledge — 활성(RAISE·미확인) ModuleFaultState 를 확인 처리.
   * faultCode 지정 시 해당 모듈만, 미지정 시 설치의 활성 fault 전체.
   * lte-{iccid} 등 동일 ICCID 설치까지 함께 처리한다.
   */
  acknowledge: async (params: {
    installationId: string;
    faultCode?: number;
    module?: number;
    username?: string | null;
  }): Promise<{ acknowledged: number }> => {
    const faultCode =
      params.faultCode ??
      (params.module != null ? params.module + 1 : undefined);
    const ids = await installationIdsForModuleFaultState(params.installationId);
    const result = await prisma.moduleFaultState.updateMany({
      where: {
        installationId: { in: ids },
        lastEvent: "RAISE",
        acknowledgedAt: null,
        ...(faultCode != null ? { faultCode } : {}),
      },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: params.username ?? null,
      },
    });
    return { acknowledged: result.count };
  },

  upsertReceiverFaultStates: async (params: {
    installationId: string;
    faults: ReceiverFaultUpsertInput[];
    criticalChannel?: boolean;
  }) => {
    for (const fault of params.faults) {
      await faultService.upsertReceiverFaultState({
        installationId: params.installationId,
        fault,
        criticalChannel: params.criticalChannel,
      });
    }
  },
};
