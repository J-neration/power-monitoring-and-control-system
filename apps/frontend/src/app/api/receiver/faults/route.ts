import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.COMMAND_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:4000";

/**
 * GET /api/receiver/faults?installationId=...&limit=50
 * Admin JWT를 쿠키에서 꺼내 백엔드 /receiver/faults로 전달
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installationId") ?? "";
  const iccid = searchParams.get("iccid") ?? "";
  const limit = searchParams.get("limit") ?? "50";

  const params = new URLSearchParams();
  if (installationId) params.set("installationId", installationId);
  if (iccid) params.set("iccid", iccid);
  params.set("limit", limit);

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/receiver/faults?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  const data = await backendRes.json().catch(() => ({ faults: [] }));
  return NextResponse.json(data, { status: backendRes.status });
}
