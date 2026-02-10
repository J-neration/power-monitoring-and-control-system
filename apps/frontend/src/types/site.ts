import type { Device } from "./device";

export type InstallationCard = {
  id: string;        // installationId
  label: string;
  capacity?: number;
  device?: Device;   // 여기서 끝
};

export type SiteDetail = {
  siteId: string;
  name: string;
  region: string;
  address: string;
  installations: InstallationCard[];
};
