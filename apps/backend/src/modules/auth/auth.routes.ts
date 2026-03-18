import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { login, toUserContext } from "./auth.service.js";
import type { JwtPayload } from "./auth.types.js";

const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (server) => {
  /* ── POST /auth/login ───────────────────────────── */
  server.post("/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "아이디와 비밀번호를 입력해주세요." });
    }

    try {
      const { payload, user } = await login(
        parsed.data.username,
        parsed.data.password
      );

      const token = server.jwt.sign(payload, { expiresIn: "8h" });

      return reply.send({ token, user });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "로그인에 실패했습니다.";
      return reply.status(401).send({ message });
    }
  });

  /* ── GET /auth/me ───────────────────────────────── */
  server.get("/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "인증이 필요합니다." });
    }
    const token = authHeader.split(" ")[1];
    try {
      const payload = server.jwt.verify<JwtPayload>(token);
      const ctx = toUserContext(payload);
      return reply.send({ user: ctx });
    } catch {
      return reply.status(401).send({ message: "유효하지 않은 토큰입니다." });
    }
  });
};
