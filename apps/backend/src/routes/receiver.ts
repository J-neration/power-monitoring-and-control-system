import { FastifyPluginAsync } from "fastify";
import { deviceService } from "../services/deviceService.js";

type ReceiverBody = {
  device_id?: string;
  value?: number | string;
  vL1?: number | string;
  vL2?: number | string;
  vL3?: number | string;
  iL1?: number | string;
  iL2?: number | string;
  iL3?: number | string;
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
    const device = deviceService.upsertFromPayload({
      device_id: body.device_id,
      value: body.value,
      ip: request.ip,
      vL1: body.vL1,
      vL2: body.vL2,
      vL3: body.vL3,
      iL1: body.iL1,
      iL2: body.iL2,
      iL3: body.iL3,
    });

    return reply.send({
      ok: true,
      received_at: new Date().toISOString(),
      echo: body,
      device,
    });
  });
};
