import { FastifyPluginAsync } from "fastify";
import { siteService } from "../services/siteService.js";
import { authenticate } from "../middleware/authenticate.js";

export const siteRoutes: FastifyPluginAsync = async (server) => {
  // 전체 사이트 목록 (메인페이지)
  server.get("/", { preHandler: authenticate }, async (request) => {
    return { sites: await siteService.list(request.user) };
  });

  // 사이트 상세 (설치 위치 카드뷰)
  server.get("/:siteId", { preHandler: authenticate }, async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const site = await siteService.get(siteId, request.user);
    if (!site) {
      return reply.status(404).send({ message: "Site not found" });
    }
    return { site };
  });
};
