import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type Params = { id: string; action: string };

async function proxy(
  request: NextRequest,
  id: string,
  action: string,
  method: "GET" | "POST",
) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const backendRes = await fetch(
      `${API_BASE}/devices/${encodeURIComponent(id)}/viewing/${action}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
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

/**
 * GET /api/devices/[id]/viewing/status
 * BFF: cookie JWT → backend remote-window status (`until`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  if (params.action !== "status") {
    return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  }
  return proxy(request, params.id, "status", "GET");
}

/**
 * POST /api/devices/[id]/viewing/start | stop
 * BFF: cookie JWT → open / close the remote window.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, action } = params;
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  }
  return proxy(request, id, action, "POST");
}
