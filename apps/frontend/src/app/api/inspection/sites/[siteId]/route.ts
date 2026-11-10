import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../../lib/inspectionProxy";

/** 검사 현장 목록 새로고침용 — 백엔드 GET /sites/:siteId (검사 현장은 ICCID 포함) */
export function GET(request: NextRequest, context: { params: { siteId: string } }) {
  return forwardToBackend(request, `/sites/${encodeURIComponent(context.params.siteId)}`, "GET");
}
