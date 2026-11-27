/** 백엔드 GET /sites 한 행 (siteService.list) */
export type SiteListFromApi = {
  siteId: string;
  name: string;
  client: string;
  region: string;
  address: string;
  installationCount: number;
  /** 출고검사 현장 (검사 계정이 묶인 현장) — 설치지점 일괄 삭제 대상 */
  inspection?: boolean;
  status: string;
  installations: SiteListInstallationFromApi[];
};

export type SiteListInstallationFromApi = {
  id: string;
  label: string;
  /** 선택. 예: PAF 400Y-100C */
  moduleName?: string | null;
  /** ADMIN 토큰, 또는 출고검사 토큰의 자기 검사 현장일 때만 포함 */
  iccid?: string | null;
  /** 고객 계정에 주·월·연 이력을 연다. 하루 이력과 관리자 화면은 항상 전부 보인다. */
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
  key: "ADMIN" | "CLIENT" | "SITE" | "VIEWER" | "INSPECTOR";
  label: string;
  description: string | null;
  sortOrder: number;
  isAssignable: boolean;
};
