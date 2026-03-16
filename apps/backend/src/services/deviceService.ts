import { siteRegistry } from "../data/deviceRegistry.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Device } from "../../prisma/generated/client/client.js";

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
    capacity?: number;
    status?: DeviceStatus;
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
          capacity: inst.capacity,
          status: inst.status,
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

const toStatusList = (value?: unknown): number[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value
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
 * Status logic (telemetry status)
 * - 현재는 moduleStatus[0] 기준을 유지 (네 기존 로직 유지)
 * - 원하면 "fault 하나라도 있으면 fault"로 바꿔줄 수 있음
 * ========================================================= */

const deriveDeviceStatus = (moduleStatus?: number[]): DeviceStatus | undefined => {
  if (!moduleStatus || moduleStatus.length === 0) {
    return undefined;
  }
  return toStatus(moduleStatus[0]);
};

export const deviceService = {
  /* =====================================================
   * Device(telemetry) list/get
   * - installation/site info는 include로 붙여서 반환
   * ===================================================== */
  list: async (): Promise<(Device & { installation: { id: string; label: string; site: { id: string; name: string; region: string; address: string } } })[]> => {
    return prisma.device.findMany({
      orderBy: { installationId: "asc" },
      include: {
        installation: {
          include: { site: true },
        },
      },
    });
  },

  get: async ({ id }: { id: string }) => {
    return prisma.device.findUnique({
      where: { installationId: id },
      include: {
        installation: {
          include: { site: true },
        },
      },
    });
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
  }) => {
    const installationId = payload.device_id?.trim();
    if (!installationId) {
      return null;
    }

    const reg = findRegistryByDeviceId(installationId);

    const lastValue = toNumber(payload.value);
    const moduleStatus = toStatusList(payload.moduleStatus);
    const numOfMods = toNumber(payload.numOfMods);

    const status = deriveDeviceStatus(moduleStatus) ?? "running";

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
            ...(reg.installation.capacity !== undefined
              ? { capacity: reg.installation.capacity }
              : {}),
          },
          create: {
            id: installationId,
            siteId: reg.site.siteId,
            label: reg.installation.label,
            ...(reg.installation.capacity !== undefined
              ? { capacity: reg.installation.capacity }
              : {}),
          },
        });
      } else {
        // Unknown mapping -> auto create "unknown" site + installation
        await ensureUnknownSiteAndInstallation(installationId);
      }

      // 2) Upsert Device telemetry by installationId
      return tx.device.upsert({
        where: { installationId },
        update: {
          status,
          lastSeenAt: new Date(),
          ...(payload.ip ? { lastIp: payload.ip } : {}),
          ...(lastValue !== undefined ? { lastValue } : {}),
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

          ...(gridCurrentTHDL1 !== undefined ? { gridCurrentTHDL1 } : {}),
          ...(gridCurrentTHDL2 !== undefined ? { gridCurrentTHDL2 } : {}),
          ...(gridCurrentTHDL3 !== undefined ? { gridCurrentTHDL3 } : {}),
        },
        create: {
          installationId,
          status,
          lastSeenAt: new Date(),
          ...(payload.ip ? { lastIp: payload.ip } : {}),
          ...(lastValue !== undefined ? { lastValue } : {}),
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

          ...(gridCurrentTHDL1 !== undefined ? { gridCurrentTHDL1 } : {}),
          ...(gridCurrentTHDL2 !== undefined ? { gridCurrentTHDL2 } : {}),
          ...(gridCurrentTHDL3 !== undefined ? { gridCurrentTHDL3 } : {}),

        },
      });
    });
  },
};
