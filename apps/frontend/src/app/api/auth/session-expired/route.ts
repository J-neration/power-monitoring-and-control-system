import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/session-expired?from=/path
 * Server components cannot clear cookies, and middleware bounces /login
 * back to / while pmcs_token exists — so clear it here, then go to /login.
 */
export function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "/";

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", safeFrom);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set("pmcs_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
