import { FastifyRequest, FastifyReply } from "fastify";
import { toUserContext } from "../modules/auth/auth.service.js";
import type { JwtPayload } from "../modules/auth/auth.types.js";

/**
 * Fastify preHandler: Authorization: Bearer <token> 검증
 * 성공 시 request.user (UserContext) 주입
 */
export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ message: "인증이 필요합니다." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = request.server.jwt.verify<JwtPayload>(token);
    request.user = toUserContext(payload);
  } catch {
    return reply.status(401).send({ message: "유효하지 않은 토큰입니다." });
  }
};

/**
 * ADMIN 전용 preHandler
 */
export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (request.user.role !== "ADMIN") {
    return reply.status(403).send({ message: "관리자 권한이 필요합니다." });
  }
};
