import { DeviceStatus } from "../services/deviceService.js";

export type InstallationEntry = {
  id: string;
  label: string;
  capacity?: number;
  status?: DeviceStatus;
};

export type SiteEntry = {
  siteId: string;
  name: string;
  region: string;
  address: string;
  installations: InstallationEntry[];
};

export const siteRegistry: SiteEntry[] = [
  {
    siteId: "prime-solution",
    name: "프라임솔루션",
    region: "경기도",
    address: "경기도 안양시 동안구 시민대로",
    installations: [
      {
        id: "PSVG-RNDTEST1",
        label: "변전실",
        capacity: 200,
        status: "running",
      },
      {
        id: "PSVG-RNDTEST2",
        label: "102동",
        capacity: 200,
        status: "standby",
      },
      {
        id: "PSVG-RNDTEST3",
        label: "전기실",
        capacity: 200,
        status: "fault",
      },
    ],
  },
];
