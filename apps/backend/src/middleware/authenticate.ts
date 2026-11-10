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

/**
 * 장치 Fault 이력 조회 — 관리자·영업 열람·출고검사. 수정·제어는 requireAdmin.
 * 범위(어느 장치까지)는 deviceService.get 이 거른다.
 */
export const requireFaultReader = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  await authenticate(request, reply);
  if (reply.sent) return;
  const role = request.user.role;
  if (role !== "ADMIN" && role !== "VIEWER" && role !== "INSPECTOR") {
    return reply.status(403).send({ message: "관리자 권한이 필요합니다." });
  }
};

/**
 * 출고검사 전용 API (/inspection/*). 관리자는 기존 /admin API 를 쓴다.
 * 범위는 토큰의 siteId(검사 현장) 하나로 고정된다.
 */
export const requireInspector = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (request.user.role !== "INSPECTOR") {
    return reply.status(403).send({ message: "출고검사 권한이 필요합니다." });
  }
};
