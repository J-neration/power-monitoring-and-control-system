import { siteRegistry } from "../data/deviceRegistry.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Device } from "../../prisma/generated/client/client.js";
import type { UserContext } from "../modules/auth/auth.types.js";

export type DeviceStatus =
  | "standby"
  | "start"
  | "running"
  | "fault"
  | "offline";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

/* =========================================================
 * Registry lookup: device_id -> {site, installation}
 * ========================================================= */

type RegistryHit = {
  site: {
    siteId: string;
    name: string;
    client: string;
    region: string;
    address: string;
  };
  installation: {
    id: string;
    label: string;
    model?: string;
    deviceCapacity?: number;
  };
};

const findRegistryByDeviceId = (deviceId: string): RegistryHit | undefined => {
  for (const site of siteRegistry) {
    const inst = site.installations.find((x) => x.id === deviceId);
    if (inst) {
      return {
        site: {
          siteId: site.siteId,
          name: site.name,
          client: site.client,
          region: site.region,
          address: site.address,
        },
        installation: {
          id: inst.id,
          label: inst.label,
          model: inst.device?.model,
          deviceCapacity: inst.device?.capacity,
        },
      };
    }
  }
  return undefined;
};

const ensureUnknownSiteAndInstallation = async (deviceId: string) => {
  await prisma.site.upsert({
    where: { id: "unknown" },
    update: { name: "Unknown", client: "unknown", region: "기타", address: "Unknown" },
    create: { id: "unknown", name: "Unknown", client: "unknown", region: "기타", address: "Unknown" },
  });

  await prisma.installation.upsert({
    where: { id: deviceId },
    update: { siteId: "unknown", label: "UNKNOWN" },
    create: { id: deviceId, siteId: "unknown", label: "UNKNOWN" },
  });
};

/* =========================================================
 * Parsing helpers
 * ========================================================= */

const KNOWN_DEVICE_MODELS = new Set(["psta", "paf", "psvg"]);

/** HMI가 보낸 model 문자열 정규화. 알려진 값만 허용, 나머지는 undefined (레지스트리/기본값 사용) */
const modelFromPayload = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const s = value.trim().toLowerCase();
  return KNOWN_DEVICE_MODELS.has(s) ? s : undefined;
};

const toNumber = (value?: number | string) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toStatus = (value?: number | string): DeviceStatus | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  switch (parsed) {
    case 0:
      return "standby";
    case 1:
      return "start";
    case 2:
      return "running";
    case 3:
      return "fault";
    case 4:
      return "offline";
    default:
      return undefined;
  }
};

const toFloatArray = (value?: unknown): number[] | undefined => {
  let arr: unknown = value;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(arr)) return undefined;
  const parsed = (arr as unknown[])
    .map((entry) => {
      if (typeof entry === "number") return Number.isFinite(entry) ? entry : undefined;
      if (typeof entry === "string") {
        const n = Number.parseFloat(entry);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    })
    .filter((e): e is number => e !== undefined);
  return parsed.length > 0 ? parsed : undefined;
};

const toStatusList = (value?: unknown): number[] | undefined => {
  let arr: unknown = value;

  // HMI가 "[2,2,2,0]" 처럼 문자열로 보내는 경우 파싱
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(arr)) {
    return undefined;
  }

  const parsed = (arr as unknown[])
    .map((entry) => {
      if (typeof entry === "number") {
        return Number.isFinite(entry) ? entry : undefined;
      }
      if (typeof entry === "string") {
        const numberValue = Number.parseInt(entry, 10);
        return Number.isFinite(numberValue) ? numberValue : undefined;
      }
      return undefined;
    })
    .filter((entry): entry is number => entry !== undefined);
  return parsed.length > 0 ? parsed : undefined;
};

/* =========================================================
 * Status logic — 설치된 모듈(≠ MOD_OFFLINE:4) 중 최악 상태
 *   fault(3) > start(1) > standby(0) > running(2) > offline(설치 없음)
 * ========================================================= */
const MODULE_STATUS_PRIORITY: Record<number, number> = {
  3: 4, // fault    — 최악
  1: 3, // start
  0: 2, // standby
  2: 1, // running  — 최선
};

export const deriveDeviceStatus = (moduleStatus?: number[]): DeviceStatus | undefined => {
  if (!moduleStatus || moduleStatus.length === 0) return undefined;

  const installed = moduleStatus.filter((m) => m !== 4);
  if (installed.length === 0) return "offline";

  const worst = installed.reduce((prev, cur) => {
    const p = MODULE_STATUS_PRIORITY[prev] ?? 0;
    const c = MODULE_STATUS_PRIORITY[cur] ?? 0;
    return c > p ? cur : prev;
  });

  return toStatus(worst) ?? "offline";
};

/* ─── 권한별 Device WHERE 필터 (site 경로로) ─────── */
const deviceWhereFilter = (ctx: UserContext) => {
  if (ctx.role === "ADMIN") return {};
  if (ctx.role === "CLIENT")
    return { installation: { site: { client: ctx.clientKey } } };
  return { installation: { site: { id: ctx.siteId } } }; // SITE
};

const canAccessDevice = (
  ctx: UserContext,
  siteClient: string,
  siteId: string
) => {
  if (ctx.role === "ADMIN") return true;
  if (ctx.role === "CLIENT") return siteClient === ctx.clientKey;
  return siteId === ctx.siteId;
};

/** USIM ICCID 정규화 (공백·하이픈 제거). HMI 페이로드와 DB 저장 시 동일 규칙 사용 */
export const normalizeIccid = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\s-]/g, "");
};

export type ReceiverIdentityResolution = {
  installationId: string | null;
  resolvedVia: "iccid" | "explicit" | null;
};

/**
 * /receiver 텔레메트리·명령 폴링용: 최종 Installation.id 결정.
 * 1) iccid → DB Installation.iccid 매핑
 * 2) 없으면 device_id / installationId (기존 HMI 호환)
 */
/**
 * ICCID로 Installation·Device 보장 (미등록 시 unknown 사이트에 자동 생성).
 * POST /receiver/faults* 전용 — API 키 없이 ICCID만으로 수신할 때 사용.
 */
export const getInstallationIdByIccid = async (
  iccidRaw: string,
): Promise<string | null> => {
  const iccid = normalizeIccid(iccidRaw);
  if (!iccid) return null;
  const row = await prisma.installation.findUnique({
    where: { iccid },
    select: { id: true },
  });
  return row?.id ?? null;
};

export const ensureInstallationForIccid = async (
  iccidRaw: string,
): Promise<
  | { ok: true; installationId: string; created: boolean }
  | { ok: false; error: "INVALID_ICCID" }
> => {
  const iccid = normalizeIccid(iccidRaw);
  if (!iccid) return { ok: false, error: "INVALID_ICCID" };

  const existing = await prisma.installation.findUnique({
    where: { iccid },
    select: { id: true },
  });

  await prisma.site.upsert({
    where: { id: "unknown" },
    update: { name: "Unknown", client: "unknown", region: "기타", address: "Unknown" },
    create: { id: "unknown", name: "Unknown", client: "unknown", region: "기타", address: "Unknown" },
  });

  const inst = await prisma.installation.upsert({
    where: { iccid },
    update: {},
    create: {
      id: `lte-${iccid}`,
      siteId: "unknown",
      label: `Auto (ICCID …${iccid.slice(-4)})`,
      iccid,
    },
    select: { id: true },
  });

  await prisma.device.upsert({
    where: { installationId: inst.id },
    update: {},
    create: { installationId: inst.id, lastIp: "unknown" },
  });

  return {
    ok: true,
    installationId: inst.id,
    created: !existing,
  };
};

export const resolveInstallationIdForReceiver = async (input: {
  iccid?: string | null;
  device_id?: string | null;
  installationId?: string | null;
}): Promise<ReceiverIdentityResolution> => {
  const iccidNorm = normalizeIccid(input.iccid);
  if (iccidNorm) {
    const row = await prisma.installation.findUnique({
      where: { iccid: iccidNorm },
      select: { id: true },
    });
    if (row) return { installationId: row.id, resolvedVia: "iccid" };
  }
  const explicit =
    (typeof input.device_id === "string" ? input.device_id.trim() : "") ||
    (typeof input.installationId === "string" ? input.installationId.trim() : "") ||
    "";
  if (explicit) return { installationId: explicit, resolvedVia: "explicit" };
  return { installationId: null, resolvedVia: null };
};

export const deviceService = {
  /* =====================================================
   * Device(telemetry) list/get
   * - installation/site info는 include로 붙여서 반환
   * ===================================================== */
  list: async (ctx: UserContext) => {
    const rows = await prisma.device.findMany({
      where: deviceWhereFilter(ctx),
      orderBy: { installationId: "asc" },
      include: { installation: { include: { site: true } } },
    });
    return rows.map((d) => ({
      ...d,
      status: deriveDeviceStatus(d.moduleStatus) ?? "offline",
    }));
  },

  get: async ({ id }: { id: string }, ctx: UserContext) => {
    const d = await prisma.device.findUnique({
      where: { installationId: id },
      include: { installation: { include: { site: true } } },
    });
    if (!d) return null;
    if (!canAccessDevice(ctx, d.installation.site.client, d.installation.siteId))
      return null;
    return { ...d, status: deriveDeviceStatus(d.moduleStatus) ?? "offline" };
  },

  /* =====================================================
   * Main entry: upsert telemetry from HMI payload
   * - Ensures Site/Installation exist (from registry)
   * - Upserts Device telemetry row by installationId
   * ===================================================== */
  upsertFromPayload: async (payload: {
    device_id?: string;
    value?: number | string;
    moduleStatus?: unknown;         // HMI: JSON array
    numOfMods?: number | string;
    ip?: string;
    vL1?: number | string;
    vL2?: number | string;
    vL3?: number | string;
    gridCurrentL1?: number | string;
    gridCurrentL2?: number | string;
    gridCurrentL3?: number | string;
    loadCurrentL1?: number | string;
    loadCurrentL2?: number | string;
    loadCurrentL3?: number | string;
    loadCurrentTHDL1?: number | string;
    loadCurrentTHDL2?: number | string;
    loadCurrentTHDL3?: number | string;
    uncompS?: number | string;
    uncompP?: number | string;
    uncompQ?: number | string;
    uncompH?: number | string;
    compS?: number | string;
    compP?: number | string;
    compQ?: number | string;
    compH?: number | string;
    tpf1?: number | string;
    tpf2?: number | string;
    dpf1?: number | string;
    dpf2?: number | string;
    gridCurrentTHDL1?: number | string;
    gridCurrentTHDL2?: number | string;
    gridCurrentTHDL3?: number | string;
    areaTemp?: unknown;
    moduleTemp?: unknown;
    fanSpeed?: unknown;
    totalCapacity?: number | string;
    operatingCapacity?: number | string;
    reactivePowerCapacity?: number | string;
    availableMargin?: number | string;
    /** HMI 펌웨어가 보내는 장치 유형 (psta | paf | psvg). 있으면 레지스트리보다 우선 */
    model?: string;
  }) => {
    const installationId = payload.device_id?.trim();
    if (!installationId) {
      return null;
    }

    const reg = findRegistryByDeviceId(installationId);

    const lastValue = toNumber(payload.value);
    const moduleStatus = toStatusList(payload.moduleStatus);
    const numOfMods = toNumber(payload.numOfMods);

    const vL1 = toNumber(payload.vL1);
    const vL2 = toNumber(payload.vL2);
    const vL3 = toNumber(payload.vL3);

    const gridCurrentL1 = toNumber(payload.gridCurrentL1);
    const gridCurrentL2 = toNumber(payload.gridCurrentL2);
    const gridCurrentL3 = toNumber(payload.gridCurrentL3);

    const loadCurrentL1 = toNumber(payload.loadCurrentL1);
    const loadCurrentL2 = toNumber(payload.loadCurrentL2);
    const loadCurrentL3 = toNumber(payload.loadCurrentL3);

    const loadCurrentTHDL1 = toNumber(payload.loadCurrentTHDL1);
    const loadCurrentTHDL2 = toNumber(payload.loadCurrentTHDL2);
    const loadCurrentTHDL3 = toNumber(payload.loadCurrentTHDL3);

    const uncompS = toNumber(payload.uncompS);
    const uncompP = toNumber(payload.uncompP);
    const uncompQ = toNumber(payload.uncompQ);
    const uncompH = toNumber(payload.uncompH);

    const compS = toNumber(payload.compS);
    const compP = toNumber(payload.compP);
    const compQ = toNumber(payload.compQ);
    const compH = toNumber(payload.compH);

    const tpf1 = toNumber(payload.tpf1);
    const tpf2 = toNumber(payload.tpf2);
    const dpf1 = toNumber(payload.dpf1);
    const dpf2 = toNumber(payload.dpf2);

    const gridCurrentTHDL1 = toNumber(payload.gridCurrentTHDL1);
    const gridCurrentTHDL2 = toNumber(payload.gridCurrentTHDL2);
    const gridCurrentTHDL3 = toNumber(payload.gridCurrentTHDL3);

    const areaTemp = toFloatArray(payload.areaTemp);
    const moduleTemp = toFloatArray(payload.moduleTemp);
    const fanSpeed = toFloatArray(payload.fanSpeed);
    const totalCapacity = toNumber(payload.totalCapacity);
    const operatingCapacity = toNumber(payload.operatingCapacity);
    const reactivePowerCapacity = toNumber(payload.reactivePowerCapacity);
    const availableMargin = toNumber(payload.availableMargin);

    return prisma.$transaction(async (tx) => {
      // 1) Ensure Site + Installation exist
      if (reg) {
        await tx.site.upsert({
          where: { id: reg.site.siteId },
          update: {
            name: reg.site.name,
            client: reg.site.client,
            region: reg.site.region,
            address: reg.site.address,
          },
          create: {
            id: reg.site.siteId,
            name: reg.site.name,
            client: reg.site.client,
            region: reg.site.region,
            address: reg.site.address,
          },
        });

        await tx.installation.upsert({
          where: { id: installationId },
          update: {
            siteId: reg.site.siteId,
            label: reg.installation.label,
          },
          create: {
            id: installationId,
            siteId: reg.site.siteId,
            label: reg.installation.label,
          },
        });
      } else {
        // siteRegistry에 없더라도 DB에 이미 등록된 설치지점이면 그대로 사용
        const existingInst = await tx.installation.findUnique({
          where: { id: installationId },
          select: { id: true },
        });
        if (!existingInst) {
          // 완전히 미등록 장치 → "unknown" 사이트로 자동 생성
          await ensureUnknownSiteAndInstallation(installationId);
        }
      }

      // 2) Upsert Device telemetry by installationId
      const model =
        modelFromPayload(payload.model) ??
        reg?.installation.model ??
        "psvg";
      const deviceCapacity = reg?.installation.deviceCapacity ?? 200;

      // 공통 측정값 객체 (Device upsert + TelemetryRecord insert 양쪽에서 사용)
      const telemetryFields = {
        ...(moduleStatus !== undefined ? { moduleStatus } : {}),
        ...(numOfMods !== undefined ? { numOfMods: Math.trunc(numOfMods) } : {}),
        ...(vL1 !== undefined ? { vL1 } : {}),
        ...(vL2 !== undefined ? { vL2 } : {}),
        ...(vL3 !== undefined ? { vL3 } : {}),
        ...(gridCurrentL1 !== undefined ? { gridCurrentL1 } : {}),
        ...(gridCurrentL2 !== undefined ? { gridCurrentL2 } : {}),
        ...(gridCurrentL3 !== undefined ? { gridCurrentL3 } : {}),
        ...(loadCurrentL1 !== undefined ? { loadCurrentL1 } : {}),
        ...(loadCurrentL2 !== undefined ? { loadCurrentL2 } : {}),
        ...(loadCurrentL3 !== undefined ? { loadCurrentL3 } : {}),
        ...(loadCurrentTHDL1 !== undefined ? { loadCurrentTHDL1 } : {}),
        ...(loadCurrentTHDL2 !== undefined ? { loadCurrentTHDL2 } : {}),
        ...(loadCurrentTHDL3 !== undefined ? { loadCurrentTHDL3 } : {}),
        ...(gridCurrentTHDL1 !== undefined ? { gridCurrentTHDL1 } : {}),
        ...(gridCurrentTHDL2 !== undefined ? { gridCurrentTHDL2 } : {}),
        ...(gridCurrentTHDL3 !== undefined ? { gridCurrentTHDL3 } : {}),
        ...(uncompS !== undefined ? { uncompS } : {}),
        ...(uncompP !== undefined ? { uncompP } : {}),
        ...(uncompQ !== undefined ? { uncompQ } : {}),
        ...(uncompH !== undefined ? { uncompH } : {}),
        ...(compS !== undefined ? { compS } : {}),
        ...(compP !== undefined ? { compP } : {}),
        ...(compQ !== undefined ? { compQ } : {}),
        ...(compH !== undefined ? { compH } : {}),
        ...(tpf1 !== undefined ? { tpf1 } : {}),
        ...(tpf2 !== undefined ? { tpf2 } : {}),
        ...(dpf1 !== undefined ? { dpf1 } : {}),
        ...(dpf2 !== undefined ? { dpf2 } : {}),
        ...(areaTemp !== undefined ? { areaTemp } : {}),
        ...(moduleTemp !== undefined ? { moduleTemp } : {}),
        ...(fanSpeed !== undefined ? { fanSpeed } : {}),
        ...(totalCapacity !== undefined ? { totalCapacity } : {}),
        ...(operatingCapacity !== undefined ? { operatingCapacity } : {}),
        ...(reactivePowerCapacity !== undefined ? { reactivePowerCapacity } : {}),
        ...(availableMargin !== undefined ? { availableMargin } : {}),
      };

      // 2) Device 최신 스냅샷 upsert
      const device = await tx.device.upsert({
        where: { installationId },
        update: {
          model,
          capacity: deviceCapacity,
          lastSeenAt: new Date(),
          ...(payload.ip ? { lastIp: payload.ip } : {}),
          ...(lastValue !== undefined ? { lastValue } : {}),
          ...telemetryFields,
        },
        create: {
          installationId,
          model,
          capacity: deviceCapacity,
          lastSeenAt: new Date(),
          ...(payload.ip ? { lastIp: payload.ip } : {}),
          ...(lastValue !== undefined ? { lastValue } : {}),
          ...telemetryFields,
        },
      });

      // 3) TelemetryRecord 이력 INSERT
      await tx.telemetryRecord.create({
        data: {
          installationId,
          recordedAt: new Date(),
          ...telemetryFields,
        },
      });

      return device;
    });
  },

  /** 관리자: Installation에 USIM ICCID 등록·해제 (HMI는 iccid만내도 됨) */
  setInstallationIccid: async (
    installationId: string,
    iccid: string | null,
  ): Promise<
    | { ok: true }
    | { ok: false; error: "NOT_FOUND" | "ICCID_IN_USE" }
  > => {
    const inst = await prisma.installation.findUnique({
      where: { id: installationId },
      select: { id: true },
    });
    if (!inst) return { ok: false, error: "NOT_FOUND" };

    const norm =
      iccid === null || iccid === undefined || String(iccid).trim() === ""
        ? null
        : normalizeIccid(iccid);
    if (norm === "") {
      await prisma.installation.update({
        where: { id: installationId },
        data: { iccid: null },
      });
      return { ok: true };
    }

    const conflict = await prisma.installation.findFirst({
      where: { iccid: norm, NOT: { id: installationId } },
      select: { id: true },
    });
    if (conflict) return { ok: false, error: "ICCID_IN_USE" };

    await prisma.installation.update({
      where: { id: installationId },
      data: { iccid: norm },
    });
    return { ok: true };
  },

  /* =====================================================
   * 시계열 이력 조회: 최근 N시간 readings
   * ===================================================== */
  getReadings: async (
    { id, hours = 24 }: { id: string; hours?: number },
    ctx: UserContext
  ) => {
    // 장비에 대한 접근 권한 먼저 확인
    const d = await prisma.device.findUnique({
      where: { installationId: id },
      include: { installation: { include: { site: true } } },
    });
    if (!d) return null;
    if (!canAccessDevice(ctx, d.installation.site.client, d.installation.siteId))
      return null;

    const clampedHours = Math.min(Math.max(hours, 1), 168); // 1h ~ 7일
    const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000);
    return prisma.telemetryRecord.findMany({
      where: {
        installationId: id,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: "asc" },
    });
  },
};
