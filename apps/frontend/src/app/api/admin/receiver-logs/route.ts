import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

/** HMI 통신 로그 (관리자 전용). 쿼리는 그대로 백엔드에 넘긴다. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }
  const search = request.nextUrl.search;
  try {
    const res = await fetch(`${API_BASE}/admin/receiver-logs${search}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }
}
