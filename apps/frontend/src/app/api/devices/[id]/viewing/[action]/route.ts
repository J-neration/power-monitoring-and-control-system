import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type Params = { id: string; action: string };

/**
 * POST /api/devices/[id]/viewing/[action]
 * BFF: cookie JWT → backend viewing start/stop.
 * stop may include `{ notAfter }` to avoid late-stop races.
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

  let bodyText: string | undefined;
  if (action === "stop") {
    try {
      const json = await request.json();
      bodyText = JSON.stringify(json ?? {});
    } catch {
      bodyText = "{}";
    }
  }

  try {
    const backendRes = await fetch(
      `${API_BASE}/devices/${encodeURIComponent(id)}/viewing/${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(bodyText ? { "Content-Type": "application/json" } : {}),
        },
        ...(bodyText ? { body: bodyText } : {}),
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
