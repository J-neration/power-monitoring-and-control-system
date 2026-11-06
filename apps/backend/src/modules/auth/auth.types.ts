export type UserContext =
  | { role: "ADMIN"; userId: string; username: string }
  | { role: "CLIENT"; userId: string; username: string; clientKey: string }
  | { role: "SITE"; userId: string; username: string; siteId: string }
  /** 영업 열람: 모든 현장 조회만. 수정 API 는 requireAdmin 이 막는다 */
  | { role: "VIEWER"; userId: string; username: string };

/** JWT 페이로드 구조 */
export type JwtPayload = {
  sub: string;       // user.id
  username: string;
  role: "ADMIN" | "CLIENT" | "SITE" | "VIEWER";
  clientKey?: string;
  siteId?: string;
};
