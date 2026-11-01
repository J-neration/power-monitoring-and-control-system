import assert from "node:assert/strict";
import { describe, it } from "node:test";
import WebSocket from "ws";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp();

type WsEvent = { type: string; installationId?: string; [key: string]: unknown };

/** 실제 포트로 띄워 대시보드처럼 /ws 에 붙는다. 받은 이벤트를 모아 둔다. */
const connect = async () => {
  if (!t.app.server.listening) await t.app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = t.app.server.address() as { port: number };
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const events: WsEvent[] = [];
  socket.on("message", (data) => events.push(JSON.parse(String(data))));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });

  const waitFor = async (match: (e: WsEvent) => boolean, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = events.find(match);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`event not received; got ${JSON.stringify(events.map((e) => e.type))}`);
  };

  return { events, waitFor, close: () => socket.close() };
};

describe("WebSocket /ws", () => {
  it("greets a new client", async () => {
    const ws = await connect();
    try {
      await ws.waitFor((e) => e.type === "welcome");
    } finally {
      ws.close();
    }
  });

  it("broadcasts device_updated when telemetry arrives", async () => {
    await seedWorld(t.app);
    const ws = await connect();
    try {
      await hmi(t.app).post("/receiver", telemetryPayload());
      await ws.waitFor((e) => e.type === "device_updated" && e.installationId === IDS.lotteInst);
    } finally {
      ws.close();
    }
  });

  it("broadcasts the command lifecycle to the admin screen", async () => {
    const { tokens } = await seedWorld(t.app);
    const ws = await connect();
    try {
      const { command } = (
        await http(t.app).post(
          "/receiver/commands/create",
          { installationId: IDS.lotteInst, module: 0, power: "refresh" },
          { token: tokens.admin },
        )
      ).json();
      await ws.waitFor((e) => e.type === "admin_session_opened" && e.installationId === IDS.lotteInst);

      await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`);
      await ws.waitFor((e) => e.type === "admin_session_linked");

      await hmi(t.app).post("/receiver/commands/ack", { id: command.id, ok: true });
      const acked = await ws.waitFor((e) => e.type === "command_acked");
      assert.equal(acked.commandId, command.id);
      assert.equal(acked.status, "acked");
    } finally {
      ws.close();
    }
  });

  it("broadcasts critical faults", async () => {
    await seedWorld(t.app);
    const ws = await connect();
    try {
      await hmi(t.app).post("/receiver/faults/critical", {
        iccid: IDS.lotteIccid,
        faultCode: 6,
        event: "RAISE",
        channel: "critical",
      });
      const event = await ws.waitFor((e) => e.type === "critical_fault");
      assert.equal(event.installationId, IDS.lotteInst);
      assert.equal(event.faultCode, 6);
    } finally {
      ws.close();
    }
  });
});
