import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json({ message: "인증 실패" }, { status: 401 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
