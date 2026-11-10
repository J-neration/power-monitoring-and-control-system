import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../../lib/inspectionProxy";

/** 검사 장비 삭제 (수신 이력도 함께 삭제) */
export function DELETE(request: NextRequest, context: { params: { id: string } }) {
  return forwardToBackend(
    request,
    `/inspection/installations/${encodeURIComponent(context.params.id)}`,
    "DELETE",
  );
}
