import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "./serverApiBase";

/**
 * 출고검사 화면용 API 라우트 → 백엔드 전달.
 * 쿠키의 pmcs_token 을 Bearer 로 붙이고, 백엔드 상태 코드·본문을 그대로 돌려준다.
 * 권한(INSPECTOR, 검사 현장 범위)은 백엔드가 판단한다.
 */
export async function forwardToBackend(
  request: NextRequest,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
): Promise<NextResponse> {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let body: string | undefined;
  if (method === "POST" || method === "PATCH") {
    try {
      body = JSON.stringify(await request.json());
    } catch {
      return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    }
  }

  let res: Response;
  try {
    res = await fetch(`${serverApiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
