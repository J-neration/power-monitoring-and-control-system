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
