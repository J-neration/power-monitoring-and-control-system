import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";
import { watchFactsService } from "../services/watchFactsService.js";
import { authenticate, requireAdmin } from "../middleware/authenticate.js";
import { faultService } from "../services/faultService.js";
import { settingsService } from "../services/settingsService.js";
import * as viewingState from "../lib/viewingState.js";
import { wsHub } from "../lib/wsHub.js";

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
   */
  server.get("/:id/settings", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const settings = await settingsService.getByInstallationId(id);
    const adminSessionActive = await viewingState.isAdminSessionActive(id);
    return reply.send({
      settings,
      adminSessionActive,
      webSettingsActive: false,
    });
  });

  /**
   * POST /devices/admin-session/stop-all
   * Logout: clear every installation session owned by this admin.
   * Registered before /:id so "admin-session" is never treated as an id.
   */
  server.post(
    "/admin-session/stop-all",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const cleared = await viewingState.stopAllAdminSessionsForUser(
        request.user.userId,
      );
      return reply.send({ ok: true, cleared });
    },
  );

  /**
   * POST /devices/:id/viewing/start
   * 「원격 연결 열기」 → open (or extend) the remote window for REMOTE_WINDOW_MS.
   * HMI reads it from the next POST /receiver ACK and polls commands ~1/min.
   */
  server.post("/:id/viewing/start", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const until = await viewingState.openRemoteWindow(id, request.user.userId);
    wsHub.broadcast({
      type: "admin_session_opened",
      installationId: id,
      until: until.toISOString(),
    });
    return reply.send({
      ok: true,
      installationId: id,
      adminSessionActive: true,
      until: until.toISOString(),
      webSettingsActive: false,
    });
  });

  /** POST /devices/:id/viewing/stop — close the remote window now. */
  server.post("/:id/viewing/stop", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await viewingState.stopAdminSession(id);
    return reply.send({
      ok: true,
      installationId: id,
      adminSessionActive: false,
      until: null,
      webSettingsActive: false,
    });
  });

  /**
   * GET /devices/:id/viewing/status
   */
  server.get("/:id/viewing/status", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const until = await viewingState.getRemoteWindowUntil(id);
    return reply.send({
      installationId: id,
      adminSessionActive: until !== null,
      until: until?.toISOString() ?? null,
      webSettingsActive: false,
    });
  });

  /** 장치 1대 · 최근 N시간 통계 팩트 (Gemini 없음) */
  server.get("/:id/watch-facts", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { hours } = request.query as { hours?: string };
    const parsedHours = hours ? parseInt(hours, 10) : 24;
    const report = await watchFactsService.get(
      { id, hours: Number.isFinite(parsedHours) ? parsedHours : 24 },
      request.user,
    );
    if (report === null) {
      return reply.status(404).send({ message: "Device not found" });
    }
    return report;
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
