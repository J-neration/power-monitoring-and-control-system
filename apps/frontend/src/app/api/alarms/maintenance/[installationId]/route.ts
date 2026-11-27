import { NextRequest } from "next/server";
import { forwardToBackend } from "../../../../../lib/inspectionProxy";

type Ctx = { params: { installationId: string } };

const path = (ctx: Ctx) => `/alarms/maintenance/${encodeURIComponent(ctx.params.installationId)}`;

/** 점검 중 설정 { days: 1|7|30|null, note? } → 백엔드 (관리자·고객사만) */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return forwardToBackend(request, path(ctx), "PUT");
}

/** 점검 해제 → 백엔드 (관리자·고객사만) */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return forwardToBackend(request, path(ctx), "DELETE");
}
