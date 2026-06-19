import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.COMMAND_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:4000";

/**
 * 브라우저는 httpOnly 쿠키(pmcs_token)만 가지므로,
 * 클라이언트에서 이 라우트로 POST → 백엔드 /devices/:id/faults/ack 로 JWT 전달.
 * body: { faultCode?: number, module?: number } — 미지정 시 활성 fault 전체 확인.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // 빈 본문 허용 (활성 fault 전체 확인)
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${API_BASE}/devices/${encodeURIComponent(params.id)}/faults/ack`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body ?? {}),
      },
    );
  } catch {
    return NextResponse.json(
      { message: "서버에 연결할 수 없습니다." },
      { status: 503 },
    );
  }

  const data = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
