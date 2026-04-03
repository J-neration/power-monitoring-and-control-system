import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";
import { authenticate, requireAdmin } from "../middleware/authenticate.js";
import { faultService } from "../services/faultService.js";
import * as viewingState from "../lib/viewingState.js";

export const deviceRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", { preHandler: authenticate }, async (request) => {
    return { devices: await deviceService.list(request.user) };
  });

  /** Admin: 장치 상세 Fault 탭 — /receiver/faults 와 동일 데이터, 접근 권한은 GET /devices/:id 와 동일 */
  server.get("/:id/faults", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const { limit: limitRaw } = request.query as { limit?: string };
    const parsed = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const faults = await faultService.getFaults({
      installationId: id,
      limit,
    });
    return reply.send({ faults });
  });

  server.get("/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return { device };
  });

  server.get("/:id/readings", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { hours } = request.query as { hours?: string };
    const parsedHours = hours ? parseInt(hours, 10) : 24;
    const readings = await deviceService.getReadings(
      { id, hours: Number.isFinite(parsedHours) ? parsedHours : 24 },
      request.user
    );
    if (readings === null) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return { readings };
  });

  /**
   * POST /devices/:id/viewing/start
   * Called by the web UI when a user opens or returns to the device detail page.
   * Also serves as a heartbeat — re-call every 60 s to keep the TTL fresh.
   */
  server.post("/:id/viewing/start", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    viewingState.startViewing(id, userId);
    return reply.send({
      ok: true,
      installationId: id,
      activeViewers: viewingState.getActiveViewerCount(id),
    });
  });

  /**
   * POST /devices/:id/viewing/stop
   * Called by the web UI when the user navigates away, closes the tab,
   * or the tab remains hidden beyond the grace period.
   */
  server.post("/:id/viewing/stop", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    viewingState.stopViewing(id, userId);
    return reply.send({
      ok: true,
      installationId: id,
      activeViewers: viewingState.getActiveViewerCount(id),
    });
  });

  /**
   * GET /devices/:id/viewing/status
   * Returns the current active viewer count for a device.
   * Useful for admin dashboards or for the HMI to check before polling.
   */
  server.get("/:id/viewing/status", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({
      installationId: id,
      activeViewers: viewingState.getActiveViewerCount(id),
      isActivelyViewed: viewingState.hasActiveViewers(id),
    });
  });
};
