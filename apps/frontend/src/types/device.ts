export type DeviceStatus = "online" | "offline" | "warning";

export type Device = {
  id: string;
  name: string;
  location: string;
  status: DeviceStatus;
  lastSeenAt: string;
  lastValue?: number | string;
  lastIp?: string;
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
};