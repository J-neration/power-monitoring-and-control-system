export type UserContext =
  | { role: "ADMIN"; userId: string; username: string }
  | { role: "CLIENT"; userId: string; username: string; clientKey: string }
  | { role: "SITE"; userId: string; username: string; siteId: string };

/** JWT 페이로드 구조 */
export type JwtPayload = {
  sub: string;       // user.id
  username: string;
  role: "ADMIN" | "CLIENT" | "SITE";
  clientKey?: string;
  siteId?: string;
};
