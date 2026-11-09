import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../lib/serverApiBase";

const API_BASE = process.env.COMMAND_API_BASE ?? serverApiBase();

/**
 * GET /api/receiver/ota/status?installationId=...
 * Admin JWT를 쿠키에서 꺼내 백엔드 /receiver/ota/status(현재 버전 + OTA 이력)로 전달
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  params.set("installationId", searchParams.get("installationId") ?? "");
  params.set("limit", searchParams.get("limit") ?? "30");

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/receiver/ota/status?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  const data = await backendRes.json().catch(() => ({ device: null, events: [] }));
  return NextResponse.json(data, { status: backendRes.status });
}
