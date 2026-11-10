import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../../../lib/inspectionProxy";

/** ICCID 변경·해제 (iccid: null 이면 해제) */
export function PATCH(request: NextRequest, context: { params: { id: string } }) {
  return forwardToBackend(
    request,
    `/inspection/installations/${encodeURIComponent(context.params.id)}/iccid`,
    "PATCH",
  );
}
