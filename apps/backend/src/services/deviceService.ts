import { deviceRegistry } from "../data/deviceRegistry.js";
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

const getRegistryEntry = (id: string) =>
  deviceRegistry.find((entry) => entry.id === id);

const toNumber = (value?: number | string) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toStatus = (value?: number | string): DeviceStatus | undefined => {
  if (value === undefined) {
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
  return parsed;
};


export const deviceService = {
  list: async (): Promise<Device[]> => {
    return prisma.device.findMany({ orderBy: { id: "asc" } });
  },
  get: async ({ id }: { id: string }): Promise<Device | null> => {
    return prisma.device.findUnique({ where: { id } });
  },
  upsertFromPayload: async (payload: {
    device_id?: string;
    value?: number | string;
    moduleStatus?: number[];
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
  }): Promise<Device | null> => {
    const id = payload.device_id?.trim();
    if (!id) {
      return null;
    }

    const registry = getRegistryEntry(id);
    const lastValue = toNumber(payload.value);
    const moduleStatus = toStatusList(payload.moduleStatus);
    const status =
      moduleStatus && moduleStatus.length > 0
        ? toStatus(moduleStatus[0])
        : undefined;
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

    return prisma.device.upsert({
      where: { id },
      update: {
        status: status ?? "running",
        lastSeenAt: new Date(),
        ...(registry ? { name: registry.name, location: registry.location } : {}),
        ...(payload.ip ? { lastIp: payload.ip } : {}),
        ...(lastValue !== undefined ? { lastValue } : {}),
        ...(moduleStatus !== undefined ? { moduleStatus } : {}),
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
        id,
        name: registry?.name ?? id,
        location: registry?.location ?? "Unknown",
        status: status ?? "running",
        lastSeenAt: new Date(),
        ...(payload.ip ? { lastIp: payload.ip } : {}),
        ...(lastValue !== undefined ? { lastValue } : {}),
        ...(moduleStatus !== undefined ? { moduleStatus } : {}),
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
  },
};