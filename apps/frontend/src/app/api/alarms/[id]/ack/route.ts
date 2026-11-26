import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../../lib/inspectionProxy";

/** 알람 한 건 확인 + 메모 → 백엔드 POST /alarms/:id/ack (관리자·고객사만, 백엔드가 판단) */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return forwardToBackend(request, `/alarms/${encodeURIComponent(params.id)}/ack`, "POST");
}
