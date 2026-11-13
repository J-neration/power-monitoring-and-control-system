/**
 * 원격 제어 전체 흐름 — 관리자 웹 ↔ 백엔드 ↔ HMI.
 *   1) 관리자가 명령 생성 → 원격 창(adminSessionActive)이 열림
 *   2) HMI 가 다음 텔레메트리 ACK 에서 adminSessionActive=true 를 받음
 *   3) HMI 가 GET /receiver/commands 로 명령을 가져감 (pending → sent)
 *   4) HMI 가 POST /receiver/commands/ack 로 결과 보고 (sent → acked/failed)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { NO_COMMAND } from "../../src/services/commandService.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp();

const createCommand = (token: string, body: Record<string, unknown>) =>
  http(t.app).post("/receiver/commands/create", { installationId: IDS.lotteInst, module: 0, ...body }, { token });

describe("remote command round trip", () => {
  it("goes pending → sent → acked and shows up in history", async () => {
    const { tokens } = await seedWorld(t.app);

    const created = await createCommand(tokens.admin, { power: "off" });
    assert.equal(created.statusCode, 201);
    const { command, remoteWindowUntil } = created.json();
    assert.equal(command.status, "pending");
    assert.equal(command.requestedBy, "admin-reg");
    assert.ok(Date.parse(remoteWindowUntil) > Date.now());

    const ack = (await hmi(t.app).post("/receiver", telemetryPayload())).json();
    assert.equal(ack.adminSessionActive, true, "HMI must be told to start polling");

    const polled = (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();
    assert.deepEqual(polled, { id: command.id, module: 0, power: "off" });
    assert.equal((await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } })).status, "sent");

    // 이미 가져간 명령은 다시 내려주지 않는다.
    const again = (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();
    assert.deepEqual(again, NO_COMMAND);

    const acked = await hmi(t.app).post("/receiver/commands/ack", { id: command.id, ok: true, message: "done" });
    assert.equal(acked.statusCode, 200);
    assert.equal(acked.json().command.status, "acked");

    const history = (
      await http(t.app).get(`/receiver/commands/history?installationId=${IDS.lotteInst}`, { token: tokens.admin })
    ).json();
    assert.equal(history.commands[0].id, command.id);
    assert.equal(history.commands[0].status, "acked");
    assert.equal(history.policy.maxModules, 6);
  });

  it("records a failed ACK and treats a repeated ACK as idempotent", async () => {
    const { tokens } = await seedWorld(t.app);
    const { command } = (await createCommand(tokens.admin, { power: "on" })).json();
    await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`);

    const failed = (await hmi(t.app).post("/receiver/commands/ack", { id: command.id, ok: false, message: "busy" })).json();
    assert.equal(failed.command.status, "failed");
    assert.equal(failed.command.idempotent, false);

    const repeat = (await hmi(t.app).post("/receiver/commands/ack", { id: command.id, ok: true })).json();
    assert.equal(repeat.command.status, "failed");
    assert.equal(repeat.command.idempotent, true);
  });

  it("answers the no-command payload when nothing is pending", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), NO_COMMAND);
  });

  it("does not hand out an expired command", async () => {
    const { tokens } = await seedWorld(t.app);
    const { command } = (await createCommand(tokens.admin, { power: "off" })).json();
    await prisma.deviceCommand.update({ where: { id: command.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const polled = (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();

    assert.deepEqual(polled, NO_COMMAND);
    assert.equal((await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } })).status, "expired");
  });
});

describe("POST /receiver/commands/create — validation", () => {
  it("refuses a second active command for the same module", async () => {
    const { tokens } = await seedWorld(t.app);
    assert.equal((await createCommand(tokens.admin, { power: "off" })).statusCode, 201);

    const second = await createCommand(tokens.admin, { power: "on" });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().code, "ACTIVE_COMMAND_EXISTS");

    // 다른 모듈은 괜찮다.
    assert.equal((await createCommand(tokens.admin, { power: "on", module: 1 })).statusCode, 201);
  });

  for (const [why, body, status, code] of [
    ["an unknown power value", { power: "reboot" }, 400, "INVALID_POWER"],
    ["a module out of range", { power: "on", module: 6 }, 400, "INVALID_MODULE"],
    ["a negative module", { power: "on", module: -1 }, 400, "INVALID_MODULE"],
    ["an unknown installation", { power: "on", installationId: "missing" }, 404, "INSTALLATION_NOT_FOUND"],
    ["setBasic without fields", { power: "setBasic" }, 400, "INVALID_FIELDS"],
  ] as const) {
    it(`rejects ${why}`, async () => {
      const { tokens } = await seedWorld(t.app);
      const res = await createCommand(tokens.admin, body);
      assert.equal(res.statusCode, status);
      assert.equal(res.json().code, code);
    });
  }

  it("rejects a body without installationId", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).post("/receiver/commands/create", { module: 0, power: "on" }, { token: tokens.admin });
    assert.equal(res.statusCode, 400);
  });
});

describe("POST /receiver/commands/ack — validation", () => {
  it("returns 404 for an unknown command and 400 for a bad body", async () => {
    await seedWorld(t.app);
    assert.equal((await hmi(t.app).post("/receiver/commands/ack", { id: "cmd_missing", ok: true })).statusCode, 404);
    assert.equal((await hmi(t.app).post("/receiver/commands/ack", { id: "x" })).statusCode, 400);
  });

  it("requires the receiver API key", async () => {
    await seedWorld(t.app);
    assert.equal((await hmi(t.app, "nope").post("/receiver/commands/ack", { id: "x", ok: true })).statusCode, 401);
  });
});

describe("remote window (viewing)", () => {
  it("start → status → stop", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);

    const start = await api.post(`/devices/${IDS.lotteInst}/viewing/start`, undefined, { token: tokens.admin });
    assert.equal(start.statusCode, 200);
    assert.equal(start.json().adminSessionActive, true);

    const status = (await api.get(`/devices/${IDS.lotteInst}/viewing/status`, { token: tokens.client })).json();
    assert.equal(status.adminSessionActive, true);
    assert.ok(status.until);

    const ack = (await hmi(t.app).post("/receiver", telemetryPayload())).json();
    assert.equal(ack.adminSessionActive, true);

    await api.post(`/devices/${IDS.lotteInst}/viewing/stop`, undefined, { token: tokens.admin });
    assert.equal((await api.get(`/devices/${IDS.lotteInst}/viewing/status`, { token: tokens.admin })).json().adminSessionActive, false);
    assert.equal((await hmi(t.app).post("/receiver", telemetryPayload())).json().adminSessionActive, false);
  });

  it("keeps telling the HMI to poll while a command is still pending, even after the window closes", async () => {
    const { tokens } = await seedWorld(t.app);
    await createCommand(tokens.admin, { power: "off" });
    await http(t.app).post(`/devices/${IDS.lotteInst}/viewing/stop`, undefined, { token: tokens.admin });

    const ack = (await hmi(t.app).post("/receiver", telemetryPayload())).json();

    assert.equal(ack.adminSessionActive, true);
  });

  it("stop-all closes only the windows this admin opened", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);
    await api.post(`/devices/${IDS.lotteInst}/viewing/start`, undefined, { token: tokens.admin });
    await api.post(`/devices/${IDS.gsInst}/viewing/start`, undefined, { token: tokens.admin });

    const res = await api.post("/devices/admin-session/stop-all", undefined, { token: tokens.admin });

    assert.deepEqual(res.json(), { ok: true, cleared: 2 });
    assert.equal(await prisma.installation.count({ where: { adminSessionActive: true } }), 0);
  });

  it("returns 404 when opening a window on an unknown device", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).post("/devices/missing/viewing/start", undefined, { token: tokens.admin });
    assert.equal(res.statusCode, 404);
  });
});

// The poll answer can be lost on the LTE link after the server marked it sent
// (field 2026-11-13: sent, then no ACK and no report until the TTL).
describe("ota command redelivery", () => {
  const seedPackage = () =>
    prisma.otaFile.create({
      data: {
        name: "HMI_2.4.2_ota.bin",
        size: 4,
        sha256: "0".repeat(64),
        data: Buffer.from([1, 2, 3, 4]),
        downloadToken: `tok${Date.now()}${Math.random().toString(36).slice(2, 10)}`,
        kind: "code",
        version: "2.4.2",
        productId: 1,
        assetVersion: 1,
      },
    });
  const poll = async () => (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();
  const backdateSent = (id: string) =>
    prisma.deviceCommand.update({ where: { id }, data: { sentAt: new Date(Date.now() - 181_000) } });

  it("hands an unanswered ota command out again; a status report closes it", async () => {
    const { tokens } = await seedWorld(t.app);
    const file = await seedPackage();
    const { command } = (await createCommand(tokens.admin, { power: "ota", fields: { fileId: file.id } })).json();

    assert.equal((await poll()).id, command.id);
    assert.deepEqual(await poll(), NO_COMMAND, "not again within the ACK timeout");

    await backdateSent(command.id);
    const ack = (await hmi(t.app).post("/receiver", telemetryPayload())).json();
    assert.equal(ack.adminSessionActive, true);
    const again = await poll();
    assert.equal(again.id, command.id);
    assert.equal(again.ver, "2.4.2");
    let row = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } });
    assert.equal(row.status, "sent");
    assert.equal(row.retryCount, 1);

    // The HMI's ACK is lost but its progress report arrives.
    const rep = await hmi(t.app).post("/receiver/ota/status", {
      iccid: IDS.lotteIccid,
      id: command.id,
      state: "downloading",
      percent: 0,
      fw: "2.4.1",
      target: "2.4.2",
    });
    assert.equal(rep.statusCode, 200);
    row = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } });
    assert.equal(row.status, "acked");
    assert.equal(row.ackMessage, "ota status downloading");

    await prisma.deviceCommand.update({ where: { id: command.id }, data: { sentAt: new Date(Date.now() - 181_000) } });
    assert.deepEqual(await poll(), NO_COMMAND);

    // The late ACK is accepted as a repeat.
    const late = (await hmi(t.app).post("/receiver/commands/ack", { id: command.id, ok: true })).json();
    assert.equal(late.command.idempotent, true);
  });

  it("stops handing it out after 3 redeliveries", async () => {
    const { tokens } = await seedWorld(t.app);
    const file = await seedPackage();
    const { command } = (await createCommand(tokens.admin, { power: "ota", fields: { fileId: file.id } })).json();
    await poll();
    for (let i = 1; i <= 3; i++) {
      await backdateSent(command.id);
      assert.equal((await poll()).id, command.id, `redelivery ${i}`);
    }
    await backdateSent(command.id);
    assert.deepEqual(await poll(), NO_COMMAND);
    assert.equal((await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } })).status, "sent");
  });
});
