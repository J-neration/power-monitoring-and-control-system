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
  /** 선택. 예: PAF 400Y-100C */
  moduleName?: string | null;
  /** ADMIN 토큰일 때만 포함 */
  iccid?: string | null;
  /** 연간 구독 설치지점만 true. 이력 탭의 일·주·월·연 그래프 */
  historyVisible?: boolean;
  device: unknown | null;
};

export type ClientOptionFromApi = {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type RoleOptionFromApi = {
  key: "ADMIN" | "CLIENT" | "SITE";
  label: string;
  description: string | null;
  sortOrder: number;
  isAssignable: boolean;
};
