import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireInspector } from "../middleware/authenticate.js";
import { deviceService } from "../services/deviceService.js";
import { siteService } from "../services/siteService.js";
import { iccidConflictWhere, normalizeIccid } from "../lib/iccid.js";
import { prisma } from "../lib/prisma.js";
import type { UserContext } from "../modules/auth/auth.types.js";

/**
 * 출고검사 계정 전용 API.
 *
 * 검사 계정은 토큰의 siteId(검사 현장) 하나에만 묶여 있다. 그 현장 안에서
 * 장비마다 설치지점을 만들고 USIM ICCID 를 등록해 HMI 통신을 확인한다.
 * 목록·상세 조회는 기존 GET /sites/:siteId, /devices/:id 를 그대로 쓴다(범위·ICCID 노출은 서비스 계층 규칙).
 *
 * 검사가 끝나면 ICCID 를 해제(PATCH iccid=null)하고, 관리자가 실제 현장 설치지점에 다시 등록한다.
 */

/** ICCID: 숫자 18–20자리 (+ 끝 F 허용). 바코드·수기 입력 오타를 걸러낸다. */
const ICCID_RE = /^\d{18,20}F?$/i;

const iccidField = z
  .string()
  .transform((v) => normalizeIccid(v))
  .refine((v) => ICCID_RE.test(v), "ICCID 형식이 올바르지 않습니다. (숫자 18–20자리)");

const createSchema = z.object({
  iccid: iccidField,
  /** 비우면 "ICCID …1234" */
  label: z.string().trim().max(80).optional(),
  moduleName: z.string().trim().max(80, "품목명은 80자 이하여야 합니다.").optional(),
});

const setIccidSchema = z.object({
  /** null 이면 해제 (검사 완료 후 실제 현장으로 옮기기 전) */
  iccid: z.union([iccidField, z.null()]),
});

const firstZodMessage = (error: z.ZodError) =>
  error.issues[0]?.message ?? "입력값이 올바르지 않습니다.";

/** requireInspector 를 통과한 요청에서만 부른다. */
const inspectorSiteId = (user: UserContext) => {
  if (user.role !== "INSPECTOR") throw new Error("inspection route without INSPECTOR guard");
  return user.siteId;
};

export const inspectionRoutes: FastifyPluginAsync = async (server) => {
  /* ── POST /inspection/installations ── 검사 장비 추가 + ICCID 등록 */
  server.post("/installations", { preHandler: requireInspector }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: firstZodMessage(parsed.error) });
    }
    const { iccid, label, moduleName } = parsed.data;
    const siteId = inspectorSiteId(request.user);

    const conflict = await prisma.installation.findFirst({
      where: iccidConflictWhere(iccid),
      select: { id: true, siteId: true },
    });
    if (conflict) {
      // 다른 현장 설치지점 이름은 알려주지 않는다.
      return reply.status(409).send({
        message:
          conflict.siteId === siteId
            ? "이미 검사 목록에 등록된 ICCID입니다."
            : "이미 다른 현장에 등록된 ICCID입니다. 관리자에게 문의하세요.",
        code: "ICCID_IN_USE",
      });
    }

    // 같은 USIM 을 다시 검사할 수 있으므로 시각을 붙여 id 를 유일하게 만든다.
    const id = `insp-${iccid}-${Date.now().toString(36)}`;
    try {
      const installation = await siteService.createInstallation({
        id,
        siteId,
        label: label || `ICCID …${iccid.slice(-4)}`,
        moduleName: moduleName ?? null,
      });
      const set = await deviceService.setInstallationIccid(id, iccid);
      if (!set.ok) {
        await siteService.deleteInstallation(id);
        return reply.status(409).send({ message: "이미 다른 현장에 등록된 ICCID입니다.", code: set.error });
      }
      return reply.status(201).send({ installation: { ...installation, iccid } });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "P2003") {
        return reply.status(400).send({ message: "출고검사 현장이 삭제되었습니다. 관리자에게 문의하세요." });
      }
      throw err;
    }
  });

  /* ── PATCH /inspection/installations/:id/iccid ── ICCID 변경·해제 */
  server.patch("/installations/:id/iccid", { preHandler: requireInspector }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await siteService.installationBelongsTo(id, inspectorSiteId(request.user)))) {
      return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
    }
    const parsed = setIccidSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: firstZodMessage(parsed.error) });
    }
    const result = await deviceService.setInstallationIccid(id, parsed.data.iccid);
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
      }
      return reply.status(409).send({ message: "이미 다른 설치지점에 등록된 ICCID입니다.", code: result.error });
    }
    return reply.send({ ok: true, installationId: id, iccid: parsed.data.iccid });
  });

  /* ── DELETE /inspection/installations/:id ── 검사 장비 삭제 (수신 이력도 함께 삭제) */
  server.delete("/installations/:id", { preHandler: requireInspector }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await siteService.installationBelongsTo(id, inspectorSiteId(request.user)))) {
      return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
    }
    await siteService.deleteInstallation(id);
    return reply.status(204).send();
  });
};
