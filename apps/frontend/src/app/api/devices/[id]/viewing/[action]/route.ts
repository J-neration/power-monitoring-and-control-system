import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type Params = { id: string; action: string };

/**
 * POST /api/devices/[id]/viewing/[action]
 *
 * BFF proxy for viewing start/stop calls.
 * The browser cannot set Authorization headers directly because the JWT
 * is stored in an httpOnly cookie, so this server-side handler reads the
 * cookie and forwards the request to the backend with the correct header.
 *
 * action must be "start" or "stop".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, action } = params;

  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  }

  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const backendRes = await fetch(
      `${API_BASE}/devices/${encodeURIComponent(id)}/viewing/${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json(
      { message: "Could not reach the server." },
      { status: 503 },
    );
  }
}
