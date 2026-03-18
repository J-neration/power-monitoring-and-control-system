import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";

export const deviceRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async () => {
    return { devices: await deviceService.list() };
  });

  server.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id });
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return { device };
  });

  server.get("/:id/readings", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { hours } = request.query as { hours?: string };
    const parsedHours = hours ? parseInt(hours, 10) : 24;
    const readings = await deviceService.getReadings({
      id,
      hours: Number.isFinite(parsedHours) ? parsedHours : 24,
    });
    if (readings === null) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return { readings };
  });
};
