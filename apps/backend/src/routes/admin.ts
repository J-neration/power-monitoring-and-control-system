import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { userManagementService } from "../modules/auth/auth.service.js";
import { requireAdmin } from "../middleware/authenticate.js";
import { deviceService } from "../services/deviceService.js";
import { siteService } from "../services/siteService.js";

const createUserSchema = z.object({
  username: z.string().min(2),
  role: z.enum(["ADMIN", "CLIENT", "SITE"]),
  clientKey: z.string().optional(),
  siteId: z.string().optional(),
  initialPassword: z.string().optional(),
});

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  newPassword: z.string().min(4).optional(),
  clientKey: z.string().nullable().optional(),
  siteId: z.string().nullable().optional(),
});

const setInstallationIccidSchema = z.object({
  /** null 이면 ICCID 매핑 제거 */
  iccid: z.union([z.string(), z.null()]),
});

const createSiteSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "소문자·숫자·하이픈만 허용"),
  name: z.string().min(1),
  client: z.string().min(1),
  region: z.string().min(1),
  address: z.string().min(1),
});

const createInstallationSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
});

export const adminRoutes: FastifyPluginAsync = async (server) => {
  /* ── GET /admin/users ──────────────────────────── */
  server.get("/users", { preHandler: requireAdmin }, async () => {
    return { users: await userManagementService.list() };
  });

  /* ── POST /admin/users ─────────────────────────── */
  server.post("/users", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    const user = await userManagementService.create(parsed.data);
    return reply.status(201).send({ user });
  });

  /* ── PATCH /admin/users/:id ────────────────────── */
  server.patch("/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    try {
      const user = await userManagementService.update(id, parsed.data);
      return reply.send({ user });
    } catch {
      return reply.status(404).send({ message: "사용자를 찾을 수 없습니다." });
    }
  });

  /* ── DELETE /admin/users/:id ───────────────────── */
  server.delete("/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await userManagementService.delete(id);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ message: "사용자를 찾을 수 없습니다." });
    }
  });

  /* ── POST /admin/sites ─────────────────────────────── 현장 생성 */
  server.post("/sites", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createSiteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    try {
      const site = await siteService.create(parsed.data);
      return reply.status(201).send({ site });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "P2002") {
        return reply.status(409).send({ message: "이미 존재하는 현장 ID입니다." });
      }
      return reply.status(500).send({ message: "현장 생성에 실패했습니다." });
    }
  });

  /* ── DELETE /admin/sites/:siteId ──────────────────── 현장 삭제 */
  server.delete("/sites/:siteId", { preHandler: requireAdmin }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const ok = await siteService.delete(siteId);
    if (!ok) return reply.status(404).send({ message: "현장을 찾을 수 없습니다." });
    return reply.status(204).send();
  });

  /* ── POST /admin/sites/:siteId/installations ───────── 설치지점 생성 */
  server.post("/sites/:siteId/installations", { preHandler: requireAdmin }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const parsed = createInstallationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    try {
      const installation = await siteService.createInstallation({
        id: parsed.data.id,
        siteId,
        label: parsed.data.label,
      });
      return reply.status(201).send({ installation });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "P2002") {
        return reply.status(409).send({ message: "이미 존재하는 설치지점 ID입니다." });
      }
      if (e?.code === "P2003" || e?.message?.includes("Foreign key")) {
        return reply.status(404).send({ message: "현장을 찾을 수 없습니다." });
      }
      return reply.status(500).send({ message: "설치지점 생성에 실패했습니다." });
    }
  });

  /* ── DELETE /admin/installations/:installationId ───── 설치지점 삭제 */
  server.delete("/installations/:installationId", { preHandler: requireAdmin }, async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const ok = await siteService.deleteInstallation(installationId);
    if (!ok) return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
    return reply.status(204).send();
  });

  /* ── PATCH /admin/installations/:installationId/iccid ── USIM ↔ 설치지점 */
  server.patch(
    "/installations/:installationId/iccid",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { installationId } = request.params as { installationId: string };
      const parsed = setInstallationIccidSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: "입력값이 올바르지 않습니다.",
          errors: parsed.error.flatten(),
        });
      }
      const result = await deviceService.setInstallationIccid(
        installationId,
        parsed.data.iccid,
      );
      if (!result.ok) {
        if (result.error === "NOT_FOUND") {
          return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
        }
        return reply.status(409).send({
          message: "이미 다른 설치지점에 등록된 ICCID입니다.",
          code: result.error,
        });
      }
      return reply.send({ ok: true, installationId });
    },
  );
};
