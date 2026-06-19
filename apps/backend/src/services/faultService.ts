import { PrismaClient } from "../../prisma/generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { getInstallationIdByIccid, normalizeIccid } from "./deviceService.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

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
 * 자동 해제 기준: 마지막 갱신(updatedAt) 후 이 시간 동안 재발생(RAISE)이 없으면
 * 활성 fault에서 자동 제외한다. (기본 24시간)
 */
const AUTO_CLEAR_MS = 24 * 60 * 60 * 1000;

type FaultListRow = {
  id: string;
  module: number;
  desc: string;
  occurredAt: Date;
  installationId: string;
  eventName?: string | null;
  /** 현재 활성(빨강) 여부 — RAISE 상태 + 미확인 + 자동해제 시간 미경과 */
  active: boolean;
  resolvedAt?: Date | null;
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

/** installationId 목록 + (있으면) 동일 ICCID 설치(예: lte-*)의 ModuleFaultState 까지 */
const fetchModuleFaultStatesForInstallations = async (
  stateIds: string[],
  iccid: string | null | undefined,
) => {
  const norm = iccid ? normalizeIccid(iccid) : "";
  if (stateIds.length === 0 && !norm) {
    return [];
  }
  const where =
    norm.length > 0
      ? {
          OR: [
            ...(stateIds.length > 0 ? [{ installationId: { in: stateIds } }] : []),
            { installation: { iccid: norm } },
          ],
        }
      : { installationId: { in: stateIds } };

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
 * 활성 = 마지막 이벤트가 RAISE && 사용자 미확인 && 마지막 갱신 후 자동해제 시간 미경과.
 * (CLEAR 수신 → resolvedAt/ lastEvent=CLEAR → 비활성, acknowledgedAt 설정 → 비활성)
 */
const isModuleStateActive = (s: {
  lastEvent: string;
  acknowledgedAt: Date | null;
  updatedAt: Date;
  now?: number;
}): boolean => {
  if (s.lastEvent !== "RAISE") return false;
  if (s.acknowledgedAt != null) return false;
  const now = s.now ?? Date.now();
  return now - s.updatedAt.getTime() < AUTO_CLEAR_MS;
};

const mergeFaultLists = (
  events: Array<{
    id: string;
    module: number;
    desc: string;
    occurredAt: Date;
    installationId: string;
  }>,
  states: Array<{
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
  }>,
  limit: number,
): FaultListRow[] => {
  const now = Date.now();
  // 순수 이력(FaultEvent)은 과거 로그이므로 항상 비활성으로 둔다.
  const eventRows: FaultListRow[] = events.map((e) => ({
    ...e,
    eventName: null,
    active: false,
    resolvedAt: null,
    acknowledgedAt: null,
  }));
  const fromState: FaultListRow[] = states.map((s) => ({
    id: `mfs-${s.id}`,
    module: s.faultCode - 1,
    desc: "",
    occurredAt: s.updatedAt,
    installationId: s.installationId,
    eventName: s.eventName,
    active: isModuleStateActive({
      lastEvent: s.lastEvent,
      acknowledgedAt: s.acknowledgedAt,
      updatedAt: s.updatedAt,
      now,
    }),
    resolvedAt: s.resolvedAt,
    acknowledgedAt: s.acknowledgedAt,
  }));
  return [...eventRows, ...fromState]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, limit);
};

export const faultService = {
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
      const rawStates = await fetchModuleFaultStatesForInstallations(
        stateIds,
        iccidForMerge,
      );
      const states = dedupeModuleStatesByFaultCode(rawStates);
      return mergeFaultLists(events, states, limit);
    }

    if (params.installationId) {
      const stateIds = await installationIdsForModuleFaultState(
        params.installationId,
      );
      const instRow = await prisma.installation.findUnique({
        where: { id: params.installationId },
        select: { iccid: true },
      });
      const [events, rawStates] = await Promise.all([
        prisma.faultEvent.findMany({
          where: { installationId: params.installationId },
          orderBy: { occurredAt: "desc" },
          take: limit,
          select: selectEvent,
        }),
        fetchModuleFaultStatesForInstallations(stateIds, instRow?.iccid),
      ]);
      return mergeFaultLists(
        events,
        dedupeModuleStatesByFaultCode(rawStates),
        limit,
      );
    }

    return [];
  },

  /**
   * POST /receiver/faults* — Modbus faultCode(1–6)당 한 행 upsert.
   * 시각은 DB `updatedAt`(갱신 시각)과 CLEAR 시 `resolvedAt`(서버 수신 시각)만 사용.
   */
  upsertReceiverFaultState: async (params: {
    installationId: string;
    fault: ReceiverFaultUpsertInput;
    criticalChannel?: boolean;
  }) => {
    const { installationId, fault, criticalChannel = false } = params;

    const enCreate = normalizeEventNameForDb(fault.eventName);

    if (fault.event === "RAISE") {
      return prisma.moduleFaultState.upsert({
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
      });
    }

    const now = new Date();
    return prisma.moduleFaultState.upsert({
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
    });
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
