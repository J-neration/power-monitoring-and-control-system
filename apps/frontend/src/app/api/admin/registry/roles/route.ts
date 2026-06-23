import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

function authHeader(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function GET(request: NextRequest) {
  const auth = authHeader(request);
  if (!auth) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }
  try {
    const res = await fetch(`${API_BASE}/admin/registry/roles`, {
      headers: auth,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "서버에 연결할 수 없습니다." },
      { status: 503 },
    );
  }
}
