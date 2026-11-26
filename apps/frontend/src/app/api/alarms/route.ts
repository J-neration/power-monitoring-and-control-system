import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../lib/inspectionProxy";

export const dynamic = "force-dynamic";

/** 처리할 알람 목록 → 백엔드 GET /alarms (계정 범위·출고검사 제외는 백엔드가 거른다) */
export async function GET(request: NextRequest) {
  return forwardToBackend(request, "/alarms", "GET");
}
