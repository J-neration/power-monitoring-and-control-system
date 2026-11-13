import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../../lib/serverApiBase";

const API_BASE = process.env.COMMAND_API_BASE ?? serverApiBase();

/**
 * DELETE /api/receiver/ota/files/:id
 * Admin JWT를 쿠키에서 꺼내 백엔드 DELETE /receiver/ota/files/:id 로 전달.
 * 화면 데이터 번호마다 마지막 패키지는 백엔드가 409(되돌리기용 보관본)로 거부한다.
 */
export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/receiver/ota/files/${encodeURIComponent(context.params.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  if (backendRes.status === 204) return new NextResponse(null, { status: 204 });
  const data = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
