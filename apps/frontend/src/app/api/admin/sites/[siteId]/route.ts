import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export async function DELETE(
  request: NextRequest,
  context: { params: { siteId: string } },
) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });

  const { siteId } = context.params;
  try {
    const res = await fetch(`${API_BASE}/admin/sites/${encodeURIComponent(siteId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }
}
