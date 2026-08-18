import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { login, toUserContext, LOGIN_INVALID_MESSAGE } from "./auth.service.js";
import type { JwtPayload } from "./auth.types.js";
import {
  LoginLockedError,
  assertNotLocked,
  clearLoginFailures,
  recordLoginFailure,
} from "./loginThrottle.js";

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

    const { username, password } = parsed.data;

    try {
      assertNotLocked(username);

      const { payload, user } = await login(username, password);
      clearLoginFailures(username);

      const token = server.jwt.sign(payload, { expiresIn: "8h" });
      return reply.send({ token, user });
    } catch (err: unknown) {
      if (err instanceof LoginLockedError) {
        return reply
          .status(429)
          .header("Retry-After", String(err.retryAfterSec))
          .send({ message: err.message });
      }

      const isInvalidCreds =
        err instanceof Error && err.message === LOGIN_INVALID_MESSAGE;
      if (isInvalidCreds) {
        const lock = recordLoginFailure(username);
        if (lock.locked) {
          const locked = new LoginLockedError(lock.retryAfterSec);
          return reply
            .status(429)
            .header("Retry-After", String(locked.retryAfterSec))
            .send({ message: locked.message });
        }
        return reply.status(401).send({ message: LOGIN_INVALID_MESSAGE });
      }

      request.log.error({ err }, "login failed");
      return reply.status(500).send({ message: "로그인에 실패했습니다." });
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
