export type DeviceStatus = "online" | "offline" | "warning";

export type Device = {
  id: string;
  name: string;
  location: string;
  status: DeviceStatus;
  inputs: number;
  outputs: number;
  lastSeenAt: string;
};

const devices: Device[] = [
  {
    id: "hdmi-1",
    name: "HDMI Matrix A",
    location: "Rack 1",
    status: "online",
    inputs: 8,
    outputs: 8,
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: "hdmi-2",
    name: "Capture Node 3",
    location: "Studio 2",
    status: "warning",
    inputs: 4,
    outputs: 2,
    lastSeenAt: new Date().toISOString(),
  },
];

export const deviceService = {
  list: () => devices,
  get: ({ id }: { id: string }) => devices.find((device) => device.id === id),
};
