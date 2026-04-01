/** 백엔드 GET /sites 한 행 (siteService.list) */
export type SiteListFromApi = {
  siteId: string;
  name: string;
  client: string;
  region: string;
  address: string;
  installationCount: number;
  status: string;
  installations: SiteListInstallationFromApi[];
};

export type SiteListInstallationFromApi = {
  id: string;
  label: string;
  /** ADMIN 토큰일 때만 포함 */
  iccid?: string | null;
  device: unknown | null;
};
