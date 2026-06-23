import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { userManagementService } from "../modules/auth/auth.service.js";
import { requireAdmin } from "../middleware/authenticate.js";
import { deviceService } from "../services/deviceService.js";
import { siteService } from "../services/siteService.js";
import { registryService } from "../services/registryService.js";

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

const updateSiteSchema = z.object({
  name: z.string().min(1),
  client: z.string().min(1),
  region: z.string().min(1),
  address: z.string().min(1),
});

const createInstallationSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
});

const createClientOptionSchema = z.object({
  key: z.string().min(1).max(32),
  label: z.string().min(1).max(64),
  sortOrder: z.number().int().optional(),
});

const updateClientOptionSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateRoleOptionSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  description: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isAssignable: z.boolean().optional(),
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
    if (!(await registryService.isAssignableRole(parsed.data.role))) {
      return reply.status(400).send({ message: "사용할 수 없는 역할입니다." });
    }
    if (parsed.data.role === "CLIENT") {
      if (
        !parsed.data.clientKey ||
        !(await registryService.isActiveClientKey(parsed.data.clientKey))
      ) {
        return reply.status(400).send({ message: "유효한 건설사를 선택해주세요." });
      }
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

  /* ── PATCH /admin/sites/:siteId ──────────────────── 현장 수정 */
  server.patch("/sites/:siteId", { preHandler: requireAdmin }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const parsed = updateSiteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    const site = await siteService.update(siteId, parsed.data);
    if (!site) return reply.status(404).send({ message: "현장을 찾을 수 없습니다." });
    return reply.send({ site });
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

  /* ── Registry: 건설사 옵션 ───────────────────────── */
  server.get("/registry/clients", { preHandler: requireAdmin }, async (request) => {
    const includeInactive =
      (request.query as { includeInactive?: string }).includeInactive === "1";
    const { rows, source } = await registryService.listClients({ includeInactive });
    return { clients: rows, source };
  });

  server.post("/registry/clients", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createClientOptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    try {
      const client = await registryService.createClient(parsed.data);
      return reply.status(201).send({ client, source: "db" });
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.message === "REGISTRY_NOT_READY") {
        return reply.status(503).send({
          message: "마스터 데이터 테이블이 없습니다. 백엔드에서 prisma migrate deploy 를 실행하세요.",
        });
      }
      if (e?.message === "INVALID_KEY") {
        return reply.status(400).send({ message: "키는 영문 소문자로 시작하고, 영문·숫자·_- 만 사용할 수 있습니다." });
      }
      if (e?.code === "P2002") {
        return reply.status(409).send({ message: "이미 존재하는 건설사 키입니다." });
      }
      return reply.status(500).send({ message: "건설사 등록에 실패했습니다." });
    }
  });

  server.patch("/registry/clients/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateClientOptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    try {
      const client = await registryService.updateClient(id, parsed.data);
      return reply.send({ client });
    } catch {
      return reply.status(404).send({ message: "건설사를 찾을 수 없습니다." });
    }
  });

  server.delete("/registry/clients/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await registryService.deleteClient(id);
      return reply.status(204).send();
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e?.message === "IN_USE") {
        return reply.status(409).send({ message: "현장 또는 계정에서 사용 중인 건설사는 삭제할 수 없습니다." });
      }
      return reply.status(404).send({ message: "건설사를 찾을 수 없습니다." });
    }
  });

  /* ── Registry: 역할 옵션 ─────────────────────────── */
  server.get("/registry/roles", { preHandler: requireAdmin }, async () => {
    const { rows, source } = await registryService.listRoles();
    return { roles: rows, source };
  });

  server.patch("/registry/roles/:key", { preHandler: requireAdmin }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const parsed = updateRoleOptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "입력값이 올바르지 않습니다.", errors: parsed.error.flatten() });
    }
    try {
      const role = await registryService.updateRole(key, parsed.data);
      return reply.send({ role, source: "db" });
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e?.message === "REGISTRY_NOT_READY") {
        return reply.status(503).send({
          message: "마스터 데이터 테이블이 없습니다. 백엔드에서 prisma migrate deploy 를 실행하세요.",
        });
      }
      if (e?.message === "INVALID_ROLE") {
        return reply.status(400).send({ message: "지원하지 않는 역할 키입니다." });
      }
      return reply.status(404).send({ message: "역할을 찾을 수 없습니다." });
    }
  });
};
