import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.COMMAND_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:4000";

/**
 * POST /api/devices/admin-session/stop-all
 * Clears all adminSessionActive rows for the logged-in admin (logout).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/devices/admin-session/stop-all`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
