import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

function authHeader(request: NextRequest) {
  const token = request.cookies.get("pmcs_token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function GET(request: NextRequest) {
  const auth = authHeader(request);
  if (!auth) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }
  const includeInactive = request.nextUrl.searchParams.get("includeInactive");
  const q = includeInactive === "1" ? "?includeInactive=1" : "";
  try {
    const res = await fetch(`${API_BASE}/admin/registry/clients${q}`, {
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

export async function POST(request: NextRequest) {
  const auth = authHeader(request);
  if (!auth) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_BASE}/admin/registry/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(body),
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
