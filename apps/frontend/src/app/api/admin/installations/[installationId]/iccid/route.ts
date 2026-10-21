import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

export async function PATCH(
  request: NextRequest,
  context: { params: { installationId: string } },
) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const { installationId } = context.params;
  if (!installationId) {
    return NextResponse.json({ message: "installationId가 없습니다." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${API_BASE}/admin/installations/${encodeURIComponent(installationId)}/iccid`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
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
