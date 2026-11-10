export type UserContext =
  | { role: "ADMIN"; userId: string; username: string }
  | { role: "CLIENT"; userId: string; username: string; clientKey: string }
  | { role: "SITE"; userId: string; username: string; siteId: string }
  /** 영업 열람: 모든 현장 조회만. 수정 API 는 requireAdmin 이 막는다 */
  | { role: "VIEWER"; userId: string; username: string }
  /** 출고검사: 모든 현장 조회 + 검사 현장(siteId) 안에서만 설치지점·ICCID 등록. 제어·설정은 requireAdmin 이 막는다 */
  | { role: "INSPECTOR"; userId: string; username: string; siteId: string };

/**
 * 이 현장(siteId)의 SIM ICCID 를 응답에 넣어도 되는지.
 * 관리자는 전부, 출고검사는 자기 검사 현장 것만 (다른 현장은 조회만 되고 ICCID 는 숨김).
 * 고객(CLIENT·SITE)·영업 열람(VIEWER)에게는 숨긴다.
 */
export const canSeeIccid = (ctx: UserContext, siteId: string) =>
  ctx.role === "ADMIN" || (ctx.role === "INSPECTOR" && ctx.siteId === siteId);

/** JWT 페이로드 구조 */
export type JwtPayload = {
  sub: string;       // user.id
  username: string;
  role: "ADMIN" | "CLIENT" | "SITE" | "VIEWER" | "INSPECTOR";
  clientKey?: string;
  siteId?: string;
};
