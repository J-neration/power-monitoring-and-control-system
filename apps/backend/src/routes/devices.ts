import { FastifyPluginAsync, type FastifyReply, type FastifyRequest } from "fastify";
import { deviceService } from "../services/deviceService.js";
import { watchFactsService } from "../services/watchFactsService.js";
import { authenticate, requireAdmin, requireAdminOrViewer } from "../middleware/authenticate.js";
import { toUserContext } from "../modules/auth/auth.service.js";
import type { JwtPayload } from "../modules/auth/auth.types.js";
import { faultService } from "../services/faultService.js";
import { settingsService } from "../services/settingsService.js";
import * as viewingState from "../lib/viewingState.js";
import { wsHub } from "../lib/wsHub.js";
import { resolveHistoryQuery } from "../lib/historyRange.js";
import { ARRAY_METRICS, SCALAR_METRICS, type HistoryPoint } from "../lib/telemetryAggregate.js";
import { retentionConfig } from "../lib/retentionConfig.js";
import { getDeviceHistory } from "../services/summaryService.js";

function metricNumber(value: number | Array<number | null> | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 절감 계산에 쓰는 시간 평균만 남긴다. */
function slimOpsSample(point: HistoryPoint) {
  const peak = metricNumber(point.metricMax?.uncompP);
  const uncompP = metricNumber(point.uncompP);
  return {
    recordedAt: point.recordedAt,
    uncompP,
    uncompPMax: peak ?? uncompP,
    tpf1: metricNumber(point.tpf1),
    tpf2: metricNumber(point.tpf2),
    dpf1: metricNumber(point.dpf1),
    dpf2: metricNumber(point.dpf2),
    loadCurrentTHDL1: metricNumber(point.loadCurrentTHDL1),
    loadCurrentTHDL2: metricNumber(point.loadCurrentTHDL2),
    loadCurrentTHDL3: metricNumber(point.loadCurrentTHDL3),
    gridCurrentTHDL1: metricNumber(point.gridCurrentTHDL1),
    gridCurrentTHDL2: metricNumber(point.gridCurrentTHDL2),
    gridCurrentTHDL3: metricNumber(point.gridCurrentTHDL3),
    vL1: metricNumber(point.vL1),
    vL2: metricNumber(point.vL2),
    vL3: metricNumber(point.vL3),
  };
}

const historyPreHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = request.server.jwt.verify<JwtPayload>(authHeader.slice("Bearer ".length));
      request.user = toUserContext(payload);
      return;
    } catch {
      /* Railway 토큰은 로컬 서명과 다를 수 있다. */
    }
  }
  const peer = request.socket.remoteAddress ?? "";
  const loopback = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  if (process.env.NODE_ENV !== "production" && loopback) {
    request.user = { role: "ADMIN", userId: "local-dev", username: "local-dev" };
    return;
  }
  return reply.status(401).send({ message: "인증이 필요합니다." });
};

export const deviceRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", { preHandler: authenticate }, async (request) => {
    return { devices: await deviceService.list(request.user) };
  });

  /** Admin·영업 열람: 장치 상세 Fault 탭 (조회만) — /receiver/faults 와 동일 데이터 */
  server.get("/:id/faults", { preHandler: requireAdminOrViewer }, async (request, reply) => {
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

  /**
   * GET /devices/:id/history
   * period=day|week|month|year 에 따라 raw / hourly / daily 를 고른다.
   * 기존 /readings 는 그대로 둔다.
   * 로컬 개발에서 Railway가 이 라우트 없이 404를 주면, Next가 루프백으로 다시 호출한다.
   * 그 토큰은 Railway 서명일 수 있어, 개발 모드의 루프백만 관리자로 읽기를 허용한다.
   */
  server.get("/:id/history", { preHandler: historyPreHandler }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      period?: string;
      metric?: string;
      start?: string;
      startDate?: string;
      end?: string;
      endDate?: string;
      aggregation?: string;
      resolution?: string;
    };
    const metric = query.metric?.trim();
    if (
      metric &&
      !SCALAR_METRICS.includes(metric as (typeof SCALAR_METRICS)[number]) &&
      !ARRAY_METRICS.includes(metric as (typeof ARRAY_METRICS)[number])
    ) {
      return reply.status(400).send({ message: "알 수 없는 metric 입니다." });
    }
    const resolved = resolveHistoryQuery({
      period: query.period,
      aggregation: query.aggregation,
      resolution: query.resolution,
      start: query.start ?? query.startDate,
      end: query.end ?? query.endDate,
      intervalMinutes: retentionConfig().intervalMinutes,
    });
    if (!resolved.ok) {
      return reply.status(400).send({ message: resolved.message });
    }
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    // 고객 계정(CLIENT·SITE)만 historyVisible 로 막는다. 관리자·영업 열람은 항상 볼 수 있다.
    const longRangeClosed =
      request.user.role !== "ADMIN" &&
      request.user.role !== "VIEWER" &&
      device.installation.historyVisible !== true;
    if (longRangeClosed) {
      const askedResolution = (query.resolution ?? "auto").trim();
      const hasEnd = Boolean((query.end ?? query.endDate)?.trim());
      const dayOnly =
        resolved.value.period === "day" &&
        !hasEnd &&
        (askedResolution === "" || askedResolution === "auto" || askedResolution === "raw");
      if (!dayOnly) {
        return reply.status(403).send({
          message: "이 설치지점의 주·월·연 이력은 고객 계정에 열려 있지 않습니다.",
        });
      }
    }
    const history = await getDeviceHistory(id, resolved.value);
    return { ...history, metric: metric ?? null };
  });

  /**
   * 최근 30일 시간 평균. 절감 카드 전용.
   * 이력 탭의 주·월 공개 여부와 무관하게, 장치를 볼 수 있으면 읽는다.
   */
  server.get("/:id/ops-samples", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await deviceService.get({ id }, request.user);
    if (!device) {
      return reply.status(404).send({ message: "Device not found" });
    }
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const history = await getDeviceHistory(id, {
      period: "month",
      aggregation: "avg",
      resolution: "hourly",
      from,
      to,
    });
    const samples = history.points
      .filter((point) => !point.gap)
      .map((point) => slimOpsSample(point))
      .filter((point) => point.uncompP != null || point.tpf1 != null || point.dpf1 != null);
    return { samples, from: history.from, to: history.to, source: history.source };
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
