import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("pmcs_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // 즉시 만료
  });
  return response;
}
