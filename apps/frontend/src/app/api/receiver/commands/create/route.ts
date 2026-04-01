import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.COMMAND_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:4000";

/**
 * 브라우저는 httpOnly 쿠키(pmcs_token)만 가지므로,
 * 클라이언트에서 이 라우트로 POST → 백엔드 /receiver/commands/create 로 JWT 전달
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/receiver/commands/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      { message: "서버에 연결할 수 없습니다." },
      { status: 503 },
    );
  }

  const data = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
