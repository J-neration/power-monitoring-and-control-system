import { FastifyPluginAsync } from "fastify";
import { siteService } from "../services/siteService.js";

export const siteRoutes: FastifyPluginAsync = async (server) => {
  // 전체 사이트 목록 (메인페이지)
  server.get("/", async () => {
    return { sites: await siteService.list() };
  });

  // 사이트 상세 (설치 위치 카드뷰)
  server.get("/:siteId", async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const site = await siteService.get(siteId);
    if (!site) {
      return reply.status(404).send({ message: "Site not found" });
    }

    return { site };
  });
};
