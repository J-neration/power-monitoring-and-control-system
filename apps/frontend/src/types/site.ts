// types/site.ts

export type DeviceStatus =
  | "standby"
  | "start"
  | "running"
  | "fault"
  | "offline";

export type Device = {
  installationId: string;
  status: DeviceStatus;
  model?: string;
  capacity?: number;
  lastSeenAt: string;
  lastValue?: number | null;
  lastIp?: string | null;

  moduleStatus?: number[];
  numOfMods?: number;

  vL1?: number;
  vL2?: number;
  vL3?: number;

  gridCurrentL1?: number;
  gridCurrentL2?: number;
  gridCurrentL3?: number;

  loadCurrentL1?: number;
  loadCurrentL2?: number;
  loadCurrentL3?: number;

  loadCurrentTHDL1?: number;
  loadCurrentTHDL2?: number;
  loadCurrentTHDL3?: number;

  uncompS?: number;
  uncompP?: number;
  uncompQ?: number;
  uncompH?: number;

  compS?: number;
  compP?: number;
  compQ?: number;
  compH?: number;

  tpf1?: number;
  tpf2?: number;
  dpf1?: number;
  dpf2?: number;

  gridCurrentTHDL1?: number;
  gridCurrentTHDL2?: number;
  gridCurrentTHDL3?: number;
};

export type Installation = {
  id: string;
  label: string;
  device: Device;
};


export type Site = {
    id: string;       // e.g. "lotte-songdo-xi"
    name: string;     // e.g. "송도 크리스탈자이"
    client: string;   // e.g. "lotte" (건설사)
    region: string;   // e.g. "인천"
    address: string;
    installations: Array<{
      id: string;         // installationId (device_id)
      label: string;      // 변전실
      device: Device;     // telemetry
      coordinates?: [number, number]; // [lng, lat] — optional, for map markers
    }>;
};

export type DeviceWithInstallation = Device & {
    installation: {
      id: string;
      label: string;
      site: {
        id: string;
        name: string;
        client: string;
        region: string;
        address: string;
      };
    };
  };
  