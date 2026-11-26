import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

type RouteContext = { params: { id: string } };

/** 차수별 고조파 전류 (200A). 백엔드 GET /devices/:id/harmonics 를 그대로 전달한다. */
export async function GET(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const id = decodeURIComponent(context.params.id);
  const hours = request.nextUrl.searchParams.get("hours") ?? "168";

  const res = await fetch(
    `${API_BASE}/devices/${encodeURIComponent(id)}/harmonics?hours=${encodeURIComponent(hours)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    return NextResponse.json({ latest: null, records: [] }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
