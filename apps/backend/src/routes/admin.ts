import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { userManagementService } from "../modules/auth/auth.service.js";
import { requireAdmin } from "../middleware/authenticate.js";

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
};
