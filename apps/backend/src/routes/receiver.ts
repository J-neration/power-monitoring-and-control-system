import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";

type ReceiverBody = {
  device_id?: string;
  value?: number | string;
  gridCurrentL1?: number | string;
  gridCurrentL2?: number | string;
  gridCurrentL3?: number | string;
  loadCurrentL1?: number | string;
  loadCurrentL2?: number | string;
  loadCurrentL3?: number | string;
  tpf1?: number | string;
  tpf2?: number | string;
  dpf1?: number | string;
  dpf2?: number | string;
  gridCurrentTHDL1?: number | string;
  gridCurrentTHDL2?: number | string;
  gridCurrentTHDL3?: number | string;
  [key: string]: unknown;
};

export const receiverRoutes: FastifyPluginAsync = async (server) => {
  server.post("/", async (request, reply) => {
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
      ip: request.ip,
      gridCurrentL1: body.gridCurrentL1,
      gridCurrentL2: body.gridCurrentL2,
      gridCurrentL3: body.gridCurrentL3,
      loadCurrentL1: body.loadCurrentL1,
      loadCurrentL2: body.loadCurrentL2,
      loadCurrentL3: body.loadCurrentL3,
      tpf1: body.tpf1,
      tpf2: body.tpf2,
      dpf1: body.dpf1,
      dpf2: body.dpf2,
      gridCurrentTHDL1: body.gridCurrentTHDL1,
      gridCurrentTHDL2: body.gridCurrentTHDL2,
      gridCurrentTHDL3: body.gridCurrentTHDL3,
    });

    return reply.send({
      ok: true,
      received_at: new Date().toISOString(),
      echo: body,
      device,
    });
  });
};
