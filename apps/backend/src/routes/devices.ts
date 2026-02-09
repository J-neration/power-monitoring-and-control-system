import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";

export const deviceRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async () => {
    return { devices: await deviceService.list() };
  });

  server.get("/:id", async (request, reply) => {
    const device = await deviceService.get(request.params as { id: string });
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return { device };
  });
};
