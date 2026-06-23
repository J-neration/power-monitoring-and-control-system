import type { ClientOptionFromApi, RoleOptionFromApi } from "../types/admin";
import { CLIENT_LABELS } from "./clients";

export const DEFAULT_CLIENT_OPTIONS: ClientOptionFromApi[] = Object.entries(
  CLIENT_LABELS,
)
  .map(([key, label], index) => ({
    id: `default-${key}`,
    key,
    label,
    sortOrder: index + 1,
    isActive: true,
  }))
  .concat([
    {
      id: "default-coupang",
      key: "coupang",
      label: "쿠팡",
      sortOrder: 99,
      isActive: true,
    },
  ]);

export const DEFAULT_ROLE_OPTIONS: RoleOptionFromApi[] = [
  {
    key: "CLIENT",
    label: "건설사 담당자",
    description: "지정 건설사 소속 현장 전체 조회",
    sortOrder: 1,
    isAssignable: true,
  },
  {
    key: "SITE",
    label: "현장 관리자",
    description: "지정 현장만 조회",
    sortOrder: 2,
    isAssignable: true,
  },
  {
    key: "ADMIN",
    label: "관리자",
    description: "전체 시스템·계정 관리",
    sortOrder: 3,
    isAssignable: true,
  },
];

export function withRegistryDefaults<T extends { length: number }>(
  rows: T,
  fallback: T,
): T {
  return rows.length > 0 ? rows : fallback;
}
