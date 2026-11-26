import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate, requireAlarmAcker } from "../middleware/authenticate.js";
import {
  ACK_NOTE_MAX,
  BULK_ACK_MAX,
  HISTORY_MAX_DAYS,
  HISTORY_MAX_LIMIT,
  ackAlarmById,
  ackAlarmsBulk,
  alarmHistory,
  clearMaintenance,
  listAlarms,
  listMaintenance,
  setMaintenance,
} from "../services/alarmService.js";

/**
 * 관제 알람 API.
 *   GET  /alarms              { alarms: 처리할 알람(발생 중 전부 + 해제·미확인), maintenance: 점검 중 설비 }
 *                             로그인 계정 범위, 출고검사 현장 제외
 *   PUT  /alarms/maintenance/:installationId   점검 중 설정 { days: 1|7|30|null, note? } — 관리자·고객사
 *   DELETE /alarms/maintenance/:installationId 점검 해제 — 관리자·고객사
 *   POST /alarms/:id/ack      한 건 확인 + 메모 — 관리자·고객사만 (requireAlarmAcker)
 *   POST /alarms/ack-bulk     화면에 보인 여러 건 확인 { ids, note? } — 관리자·고객사만. 범위 밖·이미 확인은 건너뜀
 *   GET  /alarms/history      기간별 이력 (?from&to ISO, 기본 최근 7일, 최대 92일 · ?siteId · ?limit)
 */

const ackBodySchema = z
  .object({
    note: z
      .string()
      .trim()
      .max(ACK_NOTE_MAX, `메모는 ${ACK_NOTE_MAX}자 이하여야 합니다.`)
      .optional()
      .nullable(),
  })
  .optional()
  .nullable();

const bulkAckSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "확인할 알람이 없습니다.")
    .max(BULK_ACK_MAX, `한 번에 ${BULK_ACK_MAX}건까지 확인할 수 있습니다.`),
  note: z
    .string()
    .trim()
    .max(ACK_NOTE_MAX, `메모는 ${ACK_NOTE_MAX}자 이하여야 합니다.`)
    .optional()
    .nullable(),
});

const maintenanceSchema = z.object({
  /** 1·7·30일, null 이면 해제할 때까지 */
  days: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]),
  note: z
    .string()
    .trim()
    .max(ACK_NOTE_MAX, `메모는 ${ACK_NOTE_MAX}자 이하여야 합니다.`)
    .optional()
    .nullable(),
});

const historyQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  siteId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).optional(),
});

const DAY_MS = 86_400_000;

export const alarmRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", { preHandler: authenticate }, async (request) => {
    const [alarms, maintenance] = await Promise.all([
      listAlarms(request.user),
      listMaintenance(request.user),
    ]);
    return { alarms, maintenance };
  });

  server.put("/maintenance/:installationId", { preHandler: requireAlarmAcker }, async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const body = maintenanceSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ message: body.error.issues[0]?.message ?? "잘못된 요청입니다." });
    }
    const ok = await setMaintenance(
      request.user,
      installationId,
      body.data.days,
      body.data.note ? body.data.note : null,
    );
    if (!ok) return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
    return { ok: true };
  });

  server.delete("/maintenance/:installationId", { preHandler: requireAlarmAcker }, async (request, reply) => {
    const { installationId } = request.params as { installationId: string };
    const ok = await clearMaintenance(request.user, installationId);
    if (!ok) return reply.status(404).send({ message: "설치지점을 찾을 수 없습니다." });
    return { ok: true };
  });

  server.post("/:id/ack", { preHandler: requireAlarmAcker }, async (request, reply) => {
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.status(400).send({ message: "잘못된 알람 번호입니다." });
    }
    const body = ackBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ message: body.error.issues[0]?.message ?? "잘못된 요청입니다." });
    }
    const note = body.data?.note ? body.data.note : null;

    const result = await ackAlarmById(request.user, id, note);
    if (!result.ok && result.reason === "not_found") {
      return reply.status(404).send({ message: "알람을 찾을 수 없습니다." });
    }
    if (!result.ok) {
      return reply.status(409).send({ message: "이미 확인된 알람입니다.", alarm: result.alarm });
    }
    return { alarm: result.alarm };
  });

  server.post("/ack-bulk", { preHandler: requireAlarmAcker }, async (request, reply) => {
    const body = bulkAckSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ message: body.error.issues[0]?.message ?? "잘못된 요청입니다." });
    }
    const note = body.data.note ? body.data.note : null;
    return ackAlarmsBulk(request.user, [...new Set(body.data.ids)], note);
  });

  server.get("/history", { preHandler: authenticate }, async (request, reply) => {
    const q = historyQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.status(400).send({ message: "기간·개수 형식이 올바르지 않습니다." });
    }
    const to = q.data.to ? new Date(q.data.to) : new Date();
    const from = q.data.from ? new Date(q.data.from) : new Date(to.getTime() - 7 * DAY_MS);
    if (from >= to) {
      return reply.status(400).send({ message: "시작 시각이 끝 시각보다 앞서야 합니다." });
    }
    if (to.getTime() - from.getTime() > HISTORY_MAX_DAYS * DAY_MS) {
      return reply.status(400).send({ message: `기간은 최대 ${HISTORY_MAX_DAYS}일입니다.` });
    }
    const alarms = await alarmHistory(request.user, {
      from,
      to,
      siteId: q.data.siteId,
      limit: q.data.limit ?? 200,
    });
    return { from: from.toISOString(), to: to.toISOString(), alarms };
  });
};
