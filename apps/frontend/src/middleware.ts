import { NextRequest, NextResponse } from "next/server";
import { verifyHs256Jwt } from "./lib/verifyJwt";

const PUBLIC_PATHS = ["/login"];
const COOKIE_NAME = "pmcs_token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API 라우트, 정적 자산은 통과
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // /admin 인덱스 → sites (loading.tsx + page redirect() 무한 로딩 회피)
  if (pathname === "/admin" || pathname === "/admin/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/sites";
    return NextResponse.redirect(url);
  }

  let token = request.cookies.get(COOKIE_NAME)?.value;

  // AUTH_JWT_SECRET(백엔드 JWT_SECRET 과 같은 값)이 있으면 쿠키의 존재만이 아니라 서명·만료까지 확인한다.
  // 미설정이면 기존처럼 존재만 본다 — 실제 권한 검사는 어느 쪽이든 백엔드가 한다.
  const jwtSecret = process.env.AUTH_JWT_SECRET;
  let staleToken = false;
  if (token && jwtSecret && !(await verifyHs256Jwt(token, jwtSecret))) {
    token = undefined;
    staleToken = true;
  }
  const finish = (response: NextResponse) => {
    if (staleToken) response.cookies.delete(COOKIE_NAME);
    return response;
  };

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // 토큰 없음 → 보호 라우트 접근 시 /login 리다이렉트
  if (!token && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return finish(NextResponse.redirect(loginUrl));
  }

  // 이미 로그인 상태에서 /login 접근 → 대시보드로 리다이렉트
  if (token && isPublic) {
    return finish(NextResponse.redirect(new URL("/", request.url)));
  }

  return finish(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
