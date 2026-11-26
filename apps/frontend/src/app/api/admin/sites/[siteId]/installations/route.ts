import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../../lib/serverApiBase";
import { forwardToBackend } from "../../../../../../lib/inspectionProxy";

const API_BASE = serverApiBase();

export async function POST(
  request: NextRequest,
  context: { params: { siteId: string } },
) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });

  const { siteId } = context.params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API_BASE}/admin/sites/${encodeURIComponent(siteId)}/installations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }
}

/** 출고검사 현장 설치지점 일괄 삭제 → 백엔드 DELETE /admin/sites/:siteId/installations (관리자, 출고검사 현장만) */
export async function DELETE(
  request: NextRequest,
  context: { params: { siteId: string } },
) {
  return forwardToBackend(
    request,
    `/admin/sites/${encodeURIComponent(context.params.siteId)}/installations`,
    "DELETE",
  );
}
