import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../lib/inspectionProxy";

export const dynamic = "force-dynamic";

/** 알람 이력 → 백엔드 GET /alarms/history (?from&to&siteId&limit 그대로 전달) */
export async function GET(request: NextRequest) {
  const qs = request.nextUrl.search;
  return forwardToBackend(request, `/alarms/history${qs}`, "GET");
}
