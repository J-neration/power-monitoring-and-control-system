export type DeviceStatus =
  | "standby"
  | "start"
  | "running"
  | "fault"
  | "offline";

export type Device = {
  id: string;
  name: string;
  location: string;
  status: DeviceStatus;
  lastSeenAt: string;
  lastValue?: number | string;
  lastIp?: string;
  moduleStatus?: number[];
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
};