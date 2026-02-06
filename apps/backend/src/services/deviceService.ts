export type DeviceStatus = "online" | "offline" | "warning";

export type Device = {
  id: string;
  name: string;
  location: string;
  status: DeviceStatus;
  inputs: number;
  outputs: number;
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

const devices: Device[] = [
  {
    id: "HMI-1",
    name: "HMI Matrix A",
    location: "Rack 1",
    status: "online",
    inputs: 8,
    outputs: 8,
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
    id: "HMI-2",
    name: "Capture Node 3",
    location: "Studio 2",
    status: "warning",
    inputs: 4,
    outputs: 2,
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
    id: "HMI-3",
    name: "Control Room A",
    location: "Rack 1",
    status: "online",
    inputs: 12,
    outputs: 6,
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
    id: "HMI-4",
    name: "Capture Node 7",
    location: "Studio 2",
    status: "offline",
    inputs: 6,
    outputs: 4,
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
    id: "HMI-5",
    name: "Power Gateway 1",
    location: "Rack 1",
    status: "online",
    inputs: 10,
    outputs: 4,
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
    id: "HMI-6",
    name: "Power Gateway 2",
    location: "Rack 1",
    status: "online",
    inputs: 10,
    outputs: 4,
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
    id: "HMI-7",
    name: "Panel Controller 1",
    location: "Rack 1",
    status: "warning",
    inputs: 8,
    outputs: 2,
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
    id: "HMI-8",
    name: "Panel Controller 2",
    location: "Rack 1",
    status: "offline",
    inputs: 8,
    outputs: 2,
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
      inputs: 0,
      outputs: 0,
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
