import { FastifyPluginAsync } from "fastify";
import {
  deviceService,
  ensureInstallationForIccid,
  getInstallationIdByIccid,
  resolveInstallationIdForReceiver,
} from "../services/deviceService.js";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/authenticate.js";
import { commandService, CommandError } from "../services/commandService.js";
import { faultService } from "../services/faultService.js";
import { wsHub } from "../lib/wsHub.js";

type ReceiverOptions = { receiverApiKey: string };

type ReceiverBody = {
  device_id?: string;
  /** HMI/LTE 펌웨어가 설치 ID 로 보내는 경우 (`device_id`와 동일 의미) */
  installationId?: string;
  /** USIM ICCID — DB `Installation.iccid`와 매칭되면 해당 설치지점으로 처리 */
  iccid?: string;
  value?: number | string;
  moduleStatus?: number[];
  numOfMods?: number | string;
  vL1?: number | string;
  vL2?: number | string;
  vL3?: number | string;
  gridCurrentL1?: number | string;
  gridCurrentL2?: number | string;
  gridCurrentL3?: number | string;
  loadCurrentL1?: number | string;
  loadCurrentL2?: number | string;
  loadCurrentL3?: number | string;
  loadCurrentTHDL1?: number | string;
  loadCurrentTHDL2?: number | string;
  loadCurrentTHDL3?: number | string;
  uncompS?: number | string;
  uncompP?: number | string;
  uncompQ?: number | string;
  uncompH?: number | string;
  compS?: number | string;
  compP?: number | string;
  compQ?: number | string;
  compH?: number | string;
  tpf1?: number | string;
  tpf2?: number | string;
  dpf1?: number | string;
  dpf2?: number | string;
  gridCurrentTHDL1?: number | string;
  gridCurrentTHDL2?: number | string;
  gridCurrentTHDL3?: number | string;
  areaTemp?: unknown;
  moduleTemp?: unknown;
  fanSpeed?: unknown;
  totalCapacity?: number | string;
  operatingCapacity?: number | string;
  reactivePowerCapacity?: number | string;
  availableMargin?: number | string;
  /** 장치 모델: psta | paf | psvg (소문자 권장) */
  model?: string;
  /** 모듈 fault 배열. fault 없으면 [] — desc 생략 가능 */
  faults?: Array<{ module: number; desc?: string }>;
  /** Unix 초(또는 ms) — 장비 측정 시각; 없으면 서버 수신 시각 사용 */
  timestamp?: number | string;
  ts?: number | string;
  [key: string]: unknown;
};

const createCommandSchema = z.object({
  installationId: z.string().min(1),
  module: z.number().int(),
  power: z.string().min(1),
  requestedBy: z.string().trim().optional().nullable(),
});

const ackSchema = z.object({
  id: z.string().min(1),
  ok: z.boolean(),
  message: z.string().optional(),
});

/**
 * 펌웨어 alias 통일. **firstSeen / lastSeen / count 는 스키마에 없음** — 레거시 키는 무시.
 * 출력은 faultCode·event·(eventName) 만 넘겨 Zod 가 unknown 키로 실패하지 않게 함.
 */
const normalizeReceiverFaultEntry = (raw: unknown): unknown => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  let faultCode: unknown = o.faultCode ?? o.fault_code ?? o.code;
  if (faultCode === undefined && o.module !== undefined) {
    const m = typeof o.module === "number" ? o.module : Number(o.module);
    if (Number.isInteger(m) && m >= 0 && m <= 5) faultCode = m + 1;
  }
  const eventRaw = o.event ?? o.evt;
  const event =
    typeof eventRaw === "string" ? eventRaw.toUpperCase() : eventRaw;
  const eventName = o.eventName ?? o.event_name ?? o.name;
  const out: Record<string, unknown> = { faultCode, event };
  if (eventName !== undefined) out.eventName = eventName;
  return out;
};

/** 필수: faultCode(1–6), event. eventName 선택. firstSeen·lastSeen·count 불필요 */
const receiverFaultEntrySchema = z.preprocess(
  normalizeReceiverFaultEntry,
  z.object({
    faultCode: z.coerce.number().int().min(1).max(6),
    event: z.enum(["RAISE", "CLEAR"]),
    eventName: z.string().max(64).optional(),
  }),
);

const receiverFaultBatchSchema = z.object({
  iccid: z.string().min(1),
  faults: z.array(receiverFaultEntrySchema),
});

const receiverFaultCriticalSchema = z.object({
  iccid: z.string().min(1),
  faultCode: z.coerce.number().int().min(1).max(6),
  event: z.enum(["RAISE", "CLEAR"]),
  eventName: z.string().max(64).optional(),
  channel: z.literal("critical"),
});

const parseJsonObject = (rawBody: unknown): Record<string, unknown> | null => {
  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(rawBody)) {
    try {
      return JSON.parse(rawBody.toString("utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody as Record<string, unknown>;
  }
  return null;
};

/** HMI는 iccid만 보내고, DB에 등록된 매핑으로만 식별 (설치 전환 시 Railway 등에 1 로 설정) */
const receiverRequireIccidOnly = () =>
  process.env.RECEIVER_REQUIRE_ICCID === "1" ||
  process.env.RECEIVER_REQUIRE_ICCID === "true";

/** false 이면 POST /receiver/faults* 에서 미등록 ICCID → 404 (기본: 자동 Installation·Device 생성) */
const receiverFaultsAutoProvision = () => {
  const v = process.env.RECEIVER_FAULTS_AUTO_PROVISION;
  if (v === "0" || v === "false") return false;
  return true;
};

const resolveIccidToInstallationId = async (iccid: string) => {
  if (receiverFaultsAutoProvision()) {
    return ensureInstallationForIccid(iccid);
  }
  const id = await getInstallationIdByIccid(iccid);
  if (!id) {
    return { ok: false as const, error: "UNKNOWN_ICCID" as const };
  }
  return { ok: true as const, installationId: id, created: false };
};

export const receiverRoutes: FastifyPluginAsync<ReceiverOptions> = async (
  server,
  opts
) => {
  const apiKey = opts.receiverApiKey;
  const authByApiKey = (
    request: { headers: Record<string, unknown> },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  ) => {
    const providedKey = (request.headers["x-api-key"] as string | undefined) ?? "";
    if (providedKey !== apiKey) {
      reply.status(401).send({ message: "Unauthorized" });
      return false;
    }
    return true;
  };

  const notifyCriticalFault = (payload: {
    installationId: string;
    iccid: string;
    faultCode: number;
    event: "RAISE" | "CLEAR";
    ts: number;
  }) => {
    wsHub.broadcast({
      type: "critical_fault",
      installationId: payload.installationId,
      iccid: payload.iccid,
      faultCode: payload.faultCode,
      event: payload.event,
      ts: payload.ts,
    });
    if (payload.event !== "RAISE") return;
    const url = process.env.CRITICAL_FAULT_WEBHOOK_URL?.trim();
    if (!url) return;
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        source: "pmcs-receiver",
        channel: "critical",
      }),
    }).catch((err: unknown) => {
      server.log.warn({ err }, "CRITICAL_FAULT_WEBHOOK_URL request failed");
    });
  };

  /* 더 구체적인 경로를 먼저 등록 (POST /faults 가 /faults/critical 을 가리지 않도록) */
  server.post("/faults/critical", async (request, reply) => {
    const obj = parseJsonObject(request.body);
    if (!obj) {
      return reply.status(400).send({ message: "Invalid JSON body" });
    }
    const parsed = receiverFaultCriticalSchema.safeParse(obj);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid request body",
        errors: parsed.error.flatten(),
      });
    }
    const { iccid, faultCode, event, eventName } = parsed.data;
    const identity = await resolveIccidToInstallationId(iccid);
    if (!identity.ok) {
      if (identity.error === "UNKNOWN_ICCID") {
        return reply.status(404).send({
          message:
            "No installation is registered for this iccid. Register the SIM in the admin UI or set RECEIVER_FAULTS_AUTO_PROVISION.",
        });
      }
      return reply.status(400).send({ message: "Invalid iccid" });
    }
    await faultService.upsertReceiverFaultState({
      installationId: identity.installationId,
      fault: {
        faultCode,
        event,
        ...(eventName !== undefined ? { eventName } : {}),
      },
      criticalChannel: true,
    });
    notifyCriticalFault({
      installationId: identity.installationId,
      iccid: iccid.trim().replace(/[\s-]/g, ""),
      faultCode,
      event,
      ts: Math.floor(Date.now() / 1000),
    });
    return reply.status(201).send({ ok: true });
  });

  server.post("/faults", async (request, reply) => {
    const obj = parseJsonObject(request.body);
    if (!obj) {
      return reply.status(400).send({ message: "Invalid JSON body" });
    }
    if (typeof obj.iccid !== "string" || !Array.isArray(obj.faults)) {
      return reply.status(400).send({
        message: "Missing required fields: iccid and faults (array)",
      });
    }
    const parsed = receiverFaultBatchSchema.safeParse(obj);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid request body",
        errors: parsed.error.flatten(),
      });
    }
    const identity = await resolveIccidToInstallationId(parsed.data.iccid);
    if (!identity.ok) {
      if (identity.error === "UNKNOWN_ICCID") {
        return reply.status(404).send({
          message:
            "No installation is registered for this iccid. Register the SIM in the admin UI or set RECEIVER_FAULTS_AUTO_PROVISION.",
        });
      }
      return reply.status(400).send({ message: "Invalid iccid" });
    }
    await faultService.upsertReceiverFaultStates({
      installationId: identity.installationId,
      faults: parsed.data.faults,
      criticalChannel: false,
    });
    return reply.status(201).send({ ok: true });
  });

  server.post("/", async (request, reply) => {
    // API Key 검증
    if (!authByApiKey(request, reply)) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const rawBody = request.body;
    let body: ReceiverBody = {};

    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody) as ReceiverBody;
      } catch (error) {
        server.log.warn({ error }, "Failed to parse LTE payload as JSON");
        body = {};
      }
    } else if (Buffer.isBuffer(rawBody)) {
      try {
        body = JSON.parse(rawBody.toString("utf-8")) as ReceiverBody;
      } catch (error) {
        server.log.warn({ error }, "Failed to parse LTE payload buffer as JSON");
        body = {};
      }
    } else if (rawBody && typeof rawBody === "object") {
      body = rawBody as ReceiverBody;
    }

    server.log.info({ body }, "Received LTE payload");
    const identity = await resolveInstallationIdForReceiver({
      iccid: body.iccid,
      device_id: body.device_id,
      installationId: body.installationId,
    });
    if (identity.installationId) {
      server.log.info(
        { installationId: identity.installationId, resolvedVia: identity.resolvedVia },
        "Receiver identity resolved",
      );
    }

    if (receiverRequireIccidOnly()) {
      if (identity.resolvedVia !== "iccid" || !identity.installationId) {
        return reply.status(422).send({
          ok: false,
          message:
            "ICCID가 미등록이거나, 이 환경에서는 등록된 ICCID로만 수신할 수 있습니다(RECEIVER_REQUIRE_ICCID).",
          identity: {
            installationId: identity.installationId,
            resolvedVia: identity.resolvedVia,
          },
        });
      }
    }

    const device = await deviceService.upsertFromPayload({
      device_id: identity.installationId ?? undefined,
      value: body.value,
      moduleStatus: body.moduleStatus,
      numOfMods: body.numOfMods,
      vL1: body.vL1,
      vL2: body.vL2,
      vL3: body.vL3,
      ip: request.ip,
      gridCurrentL1: body.gridCurrentL1,
      gridCurrentL2: body.gridCurrentL2,
      gridCurrentL3: body.gridCurrentL3,
      loadCurrentL1: body.loadCurrentL1,
      loadCurrentL2: body.loadCurrentL2,
      loadCurrentL3: body.loadCurrentL3,
      loadCurrentTHDL1: body.loadCurrentTHDL1,
      loadCurrentTHDL2: body.loadCurrentTHDL2,
      loadCurrentTHDL3: body.loadCurrentTHDL3,
      uncompS: body.uncompS,
      uncompP: body.uncompP,
      uncompQ: body.uncompQ,
      uncompH: body.uncompH,
      compS: body.compS,
      compP: body.compP,
      compQ: body.compQ,
      compH: body.compH,
      tpf1: body.tpf1,
      tpf2: body.tpf2,
      dpf1: body.dpf1,
      dpf2: body.dpf2,
      gridCurrentTHDL1: body.gridCurrentTHDL1,
      gridCurrentTHDL2: body.gridCurrentTHDL2,
      gridCurrentTHDL3: body.gridCurrentTHDL3,
      areaTemp: body.areaTemp,
      moduleTemp: body.moduleTemp,
      fanSpeed: body.fanSpeed,
      totalCapacity: body.totalCapacity,
      operatingCapacity: body.operatingCapacity,
      reactivePowerCapacity: body.reactivePowerCapacity,
      availableMargin: body.availableMargin,
      model: typeof body.model === "string" ? body.model : undefined,
      timestamp: body.timestamp,
      ts: body.ts,
    });

    // fault 이벤트 저장 (faults 배열이 있고 비어있지 않은 경우)
    const rawFaults = Array.isArray(body.faults) ? body.faults : [];
    const validFaults = rawFaults
      .filter(
        (f): f is { module: number; desc?: string } =>
          f !== null && typeof f === "object" && typeof f.module === "number",
      )
      .map((f) => ({
        module: f.module,
        desc: typeof f.desc === "string" ? f.desc : "",
      }));
    if (validFaults.length > 0 && identity.installationId) {
      await faultService.saveFaults({
        installationId: identity.installationId,
        iccid: typeof body.iccid === "string" ? body.iccid : null,
        faults: validFaults,
      });
    }

    if (identity.installationId) {
      wsHub.broadcast({
        type: "device_updated",
        installationId: identity.installationId,
      });
    }

    return reply.send({
      ok: true,
      received_at: new Date().toISOString(),
      echo: body,
      identity: {
        installationId: identity.installationId,
        resolvedVia: identity.resolvedVia,
      },
      device,
    });
  });

  // Fault 이력 조회 (Admin 전용)
  server.get("/faults", { preHandler: requireAdmin }, async (request, reply) => {
    const q = request.query as { iccid?: string; installationId?: string; limit?: string };
    const limit = q.limit ? Number.parseInt(q.limit, 10) : 50;
    const faults = await faultService.getFaults({
      iccid: q.iccid,
      installationId: q.installationId,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return reply.send({ faults });
  });

  // Web/Admin -> create command
  server.post("/commands/create", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid request body",
        errors: parsed.error.flatten(),
      });
    }
    try {
      const cmd = await commandService.create({
        installationId: parsed.data.installationId,
        module: parsed.data.module,
        power: parsed.data.power,
        requestedBy: parsed.data.requestedBy ?? request.user.username,
      });
      server.log.info(
        { commandId: cmd.id, installationId: cmd.installationId, module: cmd.module, power: cmd.power },
        "Command created",
      );
      return reply.status(201).send({ command: cmd });
    } catch (error) {
      if (error instanceof CommandError) {
        return reply.status(error.httpStatus).send({ code: error.code, message: error.message });
      }
      server.log.error({ error }, "Failed to create command");
      return reply.status(500).send({ message: "Failed to create command" });
    }
  });

  // Device polling -> oldest pending command
  server.get("/commands", async (request, reply) => {
    if (!authByApiKey(request, reply)) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    const q = request.query as { installationId?: string; iccid?: string };
    const identity = await resolveInstallationIdForReceiver({
      iccid: q.iccid,
      installationId: q.installationId,
    });
    if (receiverRequireIccidOnly()) {
      if (identity.resolvedVia !== "iccid" || !identity.installationId) {
        return reply.status(422).send({
          ok: false,
          message:
            "명령 폴링은 등록된 ICCID 쿼리만 허용됩니다(RECEIVER_REQUIRE_ICCID). ?iccid= 사용.",
          identity: {
            installationId: identity.installationId,
            resolvedVia: identity.resolvedVia,
          },
        });
      }
    }
    const installationId = identity.installationId ?? "";
    try {
      const command = await commandService.poll(installationId);
      if (command.id) {
        server.log.info(
          {
            commandId: command.id,
            installationId,
            resolvedVia: identity.resolvedVia,
            module: command.module,
          },
          "Command polled by device",
        );
      }
      return reply.send(command);
    } catch (error) {
      if (error instanceof CommandError) {
        return reply.status(error.httpStatus).send({ code: error.code, message: error.message });
      }
      server.log.error({ error, installationId, iccid: q.iccid }, "Failed to poll command");
      return reply.status(500).send({ message: "Failed to poll command" });
    }
  });

  // Device ACK
  server.post("/commands/ack", async (request, reply) => {
    if (!authByApiKey(request, reply)) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    const parsed = ackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid ACK body",
        errors: parsed.error.flatten(),
      });
    }
    try {
      const updated = await commandService.ack(parsed.data);
      server.log.info(
        {
          commandId: updated.id,
          installationId: updated.installationId,
          status: updated.status,
          idempotent: updated.idempotent,
        },
        "ACK processed",
      );
      wsHub.broadcast({
        type: "command_acked",
        commandId: updated.id,
        status: updated.status,
        installationId: updated.installationId,
      });
      return reply.send({ command: updated });
    } catch (error) {
      if (error instanceof CommandError) {
        return reply.status(error.httpStatus).send({ code: error.code, message: error.message });
      }
      server.log.error({ error }, "Failed to ack command");
      return reply.status(500).send({ message: "Failed to ack command" });
    }
  });

  // UI history
  server.get("/commands/history", { preHandler: requireAdmin }, async (request, reply) => {
    const { installationId, limit } = request.query as {
      installationId?: string;
      limit?: string;
    };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    try {
      const commands = await commandService.history({
        installationId: installationId ?? "",
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      });
      return reply.send({ commands, policy: commandService.policy });
    } catch (error) {
      if (error instanceof CommandError) {
        return reply.status(error.httpStatus).send({ code: error.code, message: error.message });
      }
      server.log.error({ error, installationId }, "Failed to load command history");
      return reply.status(500).send({ message: "Failed to load command history" });
    }
  });
};
