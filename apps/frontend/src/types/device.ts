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
