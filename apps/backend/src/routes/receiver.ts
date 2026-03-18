import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";

type ReceiverOptions = { receiverApiKey: string };

type ReceiverBody = {
  device_id?: string;
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
  [key: string]: unknown;
};

export const receiverRoutes: FastifyPluginAsync<ReceiverOptions> = async (
  server,
  opts
) => {
  const apiKey = opts.receiverApiKey;

  server.post("/", async (request, reply) => {
    // API Key 검증
    const providedKey =
      (request.headers["x-api-key"] as string | undefined) ?? "";
    if (providedKey !== apiKey) {
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
    const device = await deviceService.upsertFromPayload({
      device_id: body.device_id,
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
    });

    return reply.send({
      ok: true,
      received_at: new Date().toISOString(),
      echo: body,
      device,
    });
  });
};
