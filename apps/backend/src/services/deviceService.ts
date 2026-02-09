import { deviceRegistry } from "../data/deviceRegistry.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Device } from "../../prisma/generated/client/client.js";

export type DeviceStatus = "online" | "offline" | "warning";

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
    ip?: string;
    gridCurrentL1?: number | string;
    gridCurrentL2?: number | string;
    gridCurrentL3?: number | string;
    loadCurrentL1?: number | string;
    loadCurrentL2?: number | string;
    loadCurrentL3?: number | string;
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
    const gridCurrentL1 = toNumber(payload.gridCurrentL1);
    const gridCurrentL2 = toNumber(payload.gridCurrentL2);
    const gridCurrentL3 = toNumber(payload.gridCurrentL3);
    const loadCurrentL1 = toNumber(payload.loadCurrentL1);
    const loadCurrentL2 = toNumber(payload.loadCurrentL2);
    const loadCurrentL3 = toNumber(payload.loadCurrentL3);
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
        status: "online",
        lastSeenAt: new Date(),
        ...(registry ? { name: registry.name, location: registry.location } : {}),
        ...(payload.ip ? { lastIp: payload.ip } : {}),
        ...(lastValue !== undefined ? { lastValue } : {}),
        ...(gridCurrentL1 !== undefined ? { gridCurrentL1 } : {}),
        ...(gridCurrentL2 !== undefined ? { gridCurrentL2 } : {}),
        ...(gridCurrentL3 !== undefined ? { gridCurrentL3 } : {}),
        ...(loadCurrentL1 !== undefined ? { loadCurrentL1 } : {}),
        ...(loadCurrentL2 !== undefined ? { loadCurrentL2 } : {}),
        ...(loadCurrentL3 !== undefined ? { loadCurrentL3 } : {}),
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
        status: "online",
        lastSeenAt: new Date(),
        ...(payload.ip ? { lastIp: payload.ip } : {}),
        ...(lastValue !== undefined ? { lastValue } : {}),
        ...(gridCurrentL1 !== undefined ? { gridCurrentL1 } : {}),
        ...(gridCurrentL2 !== undefined ? { gridCurrentL2 } : {}),
        ...(gridCurrentL3 !== undefined ? { gridCurrentL3 } : {}),
        ...(loadCurrentL1 !== undefined ? { loadCurrentL1 } : {}),
        ...(loadCurrentL2 !== undefined ? { loadCurrentL2 } : {}),
        ...(loadCurrentL3 !== undefined ? { loadCurrentL3 } : {}),
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