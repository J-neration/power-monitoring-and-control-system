import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../lib/inspectionProxy";

/** 화면에 보인 알람 여러 건 확인 → 백엔드 POST /alarms/ack-bulk { ids, note? } (관리자·고객사만) */
export async function POST(request: NextRequest) {
  return forwardToBackend(request, "/alarms/ack-bulk", "POST");
}
