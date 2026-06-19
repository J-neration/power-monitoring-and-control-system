import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const id = decodeURIComponent(context.params.id);
  const hours = request.nextUrl.searchParams.get("hours") ?? "1";

  const res = await fetch(
    `${API_BASE}/devices/${encodeURIComponent(id)}/readings?hours=${hours}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    return NextResponse.json({ readings: [] }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
