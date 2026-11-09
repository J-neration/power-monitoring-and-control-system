import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../lib/serverApiBase";

const API_BASE = process.env.COMMAND_API_BASE ?? serverApiBase();

/**
 * GET /api/receiver/ota/files
 * Admin JWT를 쿠키에서 꺼내 백엔드 /receiver/ota/files(업로드된 OTA 파일 목록)로 전달
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/receiver/ota/files`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  const data = await backendRes.json().catch(() => ({ files: [] }));
  return NextResponse.json(data, { status: backendRes.status });
}
