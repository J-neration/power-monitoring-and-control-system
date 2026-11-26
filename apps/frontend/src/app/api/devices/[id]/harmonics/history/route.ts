import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

type RouteContext = { params: { id: string } };

const PASS = ["period", "start", "end", "aggregation", "resolution", "order"] as const;

/** 이력 탭 → 고조파. 백엔드 GET /devices/:id/harmonics/history 를 그대로 전달한다. */
export async function GET(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const id = decodeURIComponent(context.params.id);
  const params = new URLSearchParams();
  for (const key of PASS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }

  const res = await fetch(
    `${API_BASE}/devices/${encodeURIComponent(id)}/harmonics/history?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const body = await res.json().catch(() => ({ message: "고조파 이력을 불러오지 못했습니다." }));
  return NextResponse.json(body, { status: res.status });
}
