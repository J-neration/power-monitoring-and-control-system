export type DeviceStatus = "online" | "offline" | "warning";

export type Device = {
  id: string;
  name: string;
  location: string;
  status: DeviceStatus;
  lastSeenAt: string;
  lastValue: number;
  lastIp: string;
  vL1: number;
  vL2: number;
  vL3: number;
  iL1: number;
  iL2: number;
  iL3: number;
};

const devices: Device[] = [
  {
    id: "device-001",
    name: "Device 001",
    location: "Rack 1",
    status: "online",
    lastSeenAt: new Date().toISOString(),
    lastValue: 0,
    lastIp: "unknown",
    vL1: 0,
    vL2: 0,
    vL3: 0,
    iL1: 0,
    iL2: 0,
    iL3: 0,
  },
  {
    id: "device-002",
    name: "Device 002",
    location: "Studio 2",
    status: "warning",
    lastSeenAt: new Date().toISOString(),
    lastValue: 0,
    lastIp: "unknown",
    vL1: 0,
    vL2: 0,
    vL3: 0,
    iL1: 0,
    iL2: 0,
    iL3: 0,
  },
];

export const deviceService = {
  list: () => devices,
  get: ({ id }: { id: string }) => devices.find((device) => device.id === id),
  upsertFromPayload: (payload: {
    device_id?: string;
    value?: number;
    ip?: string;
    vL1?: number;
    vL2?: number;
    vL3?: number;
    iL1?: number;
    iL2?: number;
    iL3?: number;
  }) => {
    const id = payload.device_id?.trim();
    if (!id) {
      return null;
    }

    const now = new Date().toISOString();
    const existing = devices.find((device) => device.id === id);
    if (existing) {
      existing.status = "online";
      existing.lastSeenAt = now;
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
      name: id,
      location: "LTE",
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
