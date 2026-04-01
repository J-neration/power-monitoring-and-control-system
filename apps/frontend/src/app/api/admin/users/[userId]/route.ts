import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

function authHeader(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: { userId: string } },
) {
  const auth = authHeader(request);
  if (!auth) return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(context.params.userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { userId: string } },
) {
  const auth = authHeader(request);
  if (!auth) return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  try {
    const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(context.params.userId)}`, {
      method: "DELETE",
      headers: auth,
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }
}
