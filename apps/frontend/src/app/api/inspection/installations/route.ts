import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../lib/inspectionProxy";

/** 검사 장비 추가 + ICCID 등록 */
export function POST(request: NextRequest) {
  return forwardToBackend(request, "/inspection/installations", "POST");
}
