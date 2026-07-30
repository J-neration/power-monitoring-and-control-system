import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      // bump when verifying Railway actually picked up a new deploy
      build: "settings-lte-v1",
    };
  });
};
