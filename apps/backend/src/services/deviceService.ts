import { deviceRegistry } from "../data/deviceRegistry.js";

export type DeviceStatus = "online" | "offline" | "warning";

export type Device = {
  id: string;
  name: string;
  location: string;
  status: DeviceStatus;
  lastSeenAt: string;
  lastValue?: number | string;
  lastIp?: string;
  vL1?: number | string;
  vL2?: number | string;
  vL3?: number | string;
  iL1?: number | string;
  iL2?: number | string;
  iL3?: number | string;
};

const now = () => new Date().toISOString();

const devices: Device[] = deviceRegistry.map((entry) => ({
  id: entry.id,
  name: entry.name,
  location: entry.location,
  status: entry.status ?? "offline",
  lastSeenAt: now(),
  lastValue: 0,
  lastIp: "unknown",
  vL1: 0,
  vL2: 0,
  vL3: 0,
  iL1: 0,
  iL2: 0,
  iL3: 0,
}));

const getRegistryEntry = (id: string) =>
  deviceRegistry.find((entry) => entry.id === id);

export const deviceService = {
  list: () => devices,
  get: ({ id }: { id: string }) => devices.find((device) => device.id === id),
  upsertFromPayload: (payload: {
    device_id?: string;
    value?: number | string;
    ip?: string;
    vL1?: number | string;
    vL2?: number | string;
    vL3?: number | string;
    iL1?: number | string;
    iL2?: number | string;
    iL3?: number | string;
  }) => {
    const id = payload.device_id?.trim();
    if (!id) {
      return null;
    }

    const now = new Date().toISOString();
    const registry = getRegistryEntry(id);
    const existing = devices.find((device) => device.id === id);
    if (existing) {
      existing.status = "online";
      existing.lastSeenAt = now;
      if (registry) {
        existing.name = registry.name;
        existing.location = registry.location;
      }
      if (payload.value !== undefined) {
        existing.lastValue = payload.value;
      }
      if (payload.ip) {
        existing.lastIp = payload.ip;
      }
      if (payload.vL1 !== undefined) {
        existing.vL1 = payload.vL1;
      }
      if (payload.vL2 !== undefined) {
        existing.vL2 = payload.vL2;
      }
      if (payload.vL3 !== undefined) {
        existing.vL3 = payload.vL3;
      }
      if (payload.iL1 !== undefined) {
        existing.iL1 = payload.iL1;
      }
      if (payload.iL2 !== undefined) {
        existing.iL2 = payload.iL2;
      }
      if (payload.iL3 !== undefined) {
        existing.iL3 = payload.iL3;
      }
      return existing;
    }

    const created: Device = {
      id,
      name: registry?.name ?? id,
      location: registry?.location ?? "Unknown",
      status: "online",
      lastSeenAt: now,
      lastValue: payload.value ?? 0,
      lastIp: payload.ip ?? "unknown",
      vL1: payload.vL1 ?? 0,
      vL2: payload.vL2 ?? 0,
      vL3: payload.vL3 ?? 0,
      iL1: payload.iL1 ?? 0,
      iL2: payload.iL2 ?? 0,
      iL3: payload.iL3 ?? 0,
    };
    devices.push(created);
    return created;
  },
};
