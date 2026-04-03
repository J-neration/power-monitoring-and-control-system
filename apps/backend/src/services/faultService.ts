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

export type ReceiverFaultUpsertInput = {
  faultCode: number;
  event: "RAISE" | "CLEAR";
  firstSeen: number;
  lastSeen: number;
  count: number;
  /** HMI 가 보내는 사람이 읽을 수 있는 이름 (예: Over Temperature) */
  eventName?: string | null;
};

/**
 * HMI Unix 시각: 보통 **초**(≈10자리). 일부는 **밀리초**(13자리 전후).
 * 1e12 초는 현실적으로 없으므로 ≥1e12 는 ms 로 본다.
 */
const epochFromDevice = (value: number): Date => {
  if (!Number.isFinite(value)) {
    return new Date();
  }
  const v = Math.trunc(value);
  if (v >= 1_000_000_000_000) {
    return new Date(v);
  }
  return new Date(v * 1000);
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

type FaultListRow = {
  id: string;
  module: number;
  desc: string;
  occurredAt: Date;
  installationId: string;
  eventName?: string | null;
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
      lastSeenAt: true,
      lastEvent: true,
      repeatCount: true,
      resolvedAt: true,
      criticalChannel: true,
      eventName: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...byId.values()];
};

/** 동일 ICCID로 `lte-*` 와 레지스트리 설치에 중복 행이 있으면 faultCode 당 최신 한 건만 */
const dedupeModuleStatesByFaultCode = <
  T extends { faultCode: number; lastSeenAt: Date },
>(
  states: T[],
): T[] => {
  const sorted = [...states].sort(
    (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );
  const map = new Map<number, T>();
  for (const s of sorted) {
    if (!map.has(s.faultCode)) map.set(s.faultCode, s);
  }
  return [...map.values()];
};

const mergeFaultLists = (
  events: FaultListRow[],
  states: Array<{
    id: string;
    installationId: string;
    faultCode: number;
    lastSeenAt: Date;
    lastEvent: string;
    repeatCount: number;
    resolvedAt: Date | null;
    criticalChannel: boolean;
    eventName: string | null;
  }>,
  limit: number,
): FaultListRow[] => {
  const eventRows: FaultListRow[] = events.map((e) => ({
    ...e,
    eventName: null,
  }));
  const fromState: FaultListRow[] = states.map((s) => ({
    id: `mfs-${s.id}`,
    module: s.faultCode - 1,
    desc: "",
    occurredAt: s.lastSeenAt,
    installationId: s.installationId,
    eventName: s.eventName,
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
   * RAISE → resolvedAt null, CLEAR → resolvedAt = lastSeen.
   */
  upsertReceiverFaultState: async (params: {
    installationId: string;
    fault: ReceiverFaultUpsertInput;
    criticalChannel?: boolean;
  }) => {
    const { installationId, fault, criticalChannel = false } = params;
    const firstSeenAt = epochFromDevice(fault.firstSeen);
    const lastSeenAt = epochFromDevice(fault.lastSeen);

    const enCreate = normalizeEventNameForDb(fault.eventName);

    if (fault.event === "RAISE") {
      return prisma.moduleFaultState.upsert({
        where: {
          installationId_faultCode: { installationId, faultCode: fault.faultCode },
        },
        create: {
          installationId,
          faultCode: fault.faultCode,
          firstSeenAt,
          lastSeenAt,
          repeatCount: fault.count,
          resolvedAt: null,
          lastEvent: "RAISE",
          criticalChannel,
          eventName: enCreate,
        },
        update: {
          firstSeenAt,
          lastSeenAt,
          repeatCount: fault.count,
          resolvedAt: null,
          lastEvent: "RAISE",
          ...(criticalChannel ? { criticalChannel: true } : {}),
          ...eventNamePatch(fault),
        },
      });
    }

    return prisma.moduleFaultState.upsert({
      where: {
        installationId_faultCode: { installationId, faultCode: fault.faultCode },
      },
      create: {
        installationId,
        faultCode: fault.faultCode,
        firstSeenAt,
        lastSeenAt,
        repeatCount: fault.count,
        resolvedAt: lastSeenAt,
        lastEvent: "CLEAR",
        criticalChannel,
        eventName: enCreate,
      },
      update: {
        lastSeenAt,
        repeatCount: fault.count,
        resolvedAt: lastSeenAt,
        lastEvent: "CLEAR",
        ...(criticalChannel ? { criticalChannel: true } : {}),
        ...eventNamePatch(fault),
      },
    });
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
