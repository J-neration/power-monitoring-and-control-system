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
