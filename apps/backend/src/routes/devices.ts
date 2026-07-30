import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";
import { authenticate, requireAdmin } from "../middleware/authenticate.js";
import { faultService } from "../services/faultService.js";
import { settingsService } from "../services/settingsService.js";
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

  /** Admin: fault Acknowledge(확인) — 활성 fault 를 확인 처리해 비활성으로 전환 */
  server.post("/:id/faults/ack", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const body = (request.body as { faultCode?: number; module?: number } | undefined) ?? {};
    const result = await faultService.acknowledge({
      installationId: id,
      faultCode: typeof body.faultCode === "number" ? body.faultCode : undefined,
      module: typeof body.module === "number" ? body.module : undefined,
      username: request.user.username,
    });
    return reply.send(result);
  });

  /**
   * GET /devices/:id/settings
   * Latest HMI basic-settings snapshot (POST /receiver/settings).
   * Registered before GET /:id so Fastify never treats "settings" as an id suffix issue.
   */
  server.get("/:id/settings", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const settings = await settingsService.getByInstallationId(id);
    const webSettingsActive = await viewingState.isWebSettingsActive(id);
    return reply.send({
      settings,
      webSettingsActive,
    });
  });

  /**
   * POST /devices/:id/viewing/start
   * Settings 탭 진입 → Installation.webSettingsActive = true (+ heartbeat).
   */
  server.post("/:id/viewing/start", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const { userId } = request.user;
    await viewingState.startViewing(id, userId);
    return reply.send({
      ok: true,
      installationId: id,
      webSettingsActive: true,
      activeViewers: await viewingState.getActiveViewerCount(id),
    });
  });

  /**
   * POST /devices/:id/viewing/stop
   * Settings 탭 이탈 → Installation.webSettingsActive = false.
   */
  server.post("/:id/viewing/stop", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    await viewingState.stopViewing(id, userId);
    return reply.send({
      ok: true,
      installationId: id,
      webSettingsActive: await viewingState.isWebSettingsActive(id),
      activeViewers: await viewingState.getActiveViewerCount(id),
    });
  });

  /**
   * GET /devices/:id/viewing/status
   */
  server.get("/:id/viewing/status", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const webSettingsActive = await viewingState.isWebSettingsActive(id);
    return reply.send({
      installationId: id,
      webSettingsActive,
      activeViewers: await viewingState.getActiveViewerCount(id),
      isActivelyViewed: webSettingsActive,
    });
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

  server.get("/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return { device };
  });
};
