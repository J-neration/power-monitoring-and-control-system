import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../lib/serverApiBase";

const API_BASE = process.env.COMMAND_API_BASE ?? serverApiBase();

type Params = { id: string };

/**
 * GET /api/devices/[id]/settings
 * BFF proxy — Admin JWT from httpOnly cookie → backend GET /devices/:id/settings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = params;
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json(
      { message: "인증이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    const backendRes = await fetch(
      `${API_BASE}/devices/${encodeURIComponent(id)}/settings`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: backendRes.status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "서버에 연결할 수 없습니다." },
      { status: 503 },
    );
  }
}
