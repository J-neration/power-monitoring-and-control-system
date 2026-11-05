import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      // bump when verifying a deploy actually picked up the new build
      build: "receiver-auth-v2",
    };
  });
};
