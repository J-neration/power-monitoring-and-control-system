import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../../lib/serverApiBase";

const API_BASE = process.env.COMMAND_API_BASE ?? serverApiBase();

/**
 * POST /api/receiver/commands/:id/cancel
 * Admin JWT를 쿠키에서 꺼내 백엔드 POST /receiver/commands/:id/cancel 로 전달.
 * HMI가 아직 응답하지 않은 명령(pending, sent)만 취소된다. 그 밖은 백엔드가 409.
 */
export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${API_BASE}/receiver/commands/${encodeURIComponent(context.params.id)}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  const data = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
