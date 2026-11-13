/**
 * HMI OTA 상태 보고와 펌웨어 버전 (HMI 저장소 docs/OTA_DEVELOPMENT_PLAN.md 10.2, 10.3).
 *   - HMI: POST /receiver/ota/status (x-api-key, iccid)
 *   - 텔레메트리: fw / otaCapable / otaState -> Device
 *   - 관리자: GET /receiver/ota/status?installationId=
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp();

const status = (body: Record<string, unknown>, apiKey?: string) =>
  hmi(t.app, apiKey).post("/receiver/ota/status", { iccid: IDS.lotteIccid, ...body });

describe("OTA status", () => {
  it("telemetry stores the firmware version and OTA state", async () => {
    await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload());
    let dev = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(dev.fwVersion, null, "old firmware sends no fw");

    await hmi(t.app).post("/receiver", telemetryPayload({ fw: "2.3.6", otaCapable: true, otaState: "idle" }));
    dev = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(dev.fwVersion, "2.3.6");
    assert.equal(dev.otaCapable, true);
    assert.equal(dev.otaState, "idle");
    assert.equal(dev.assetVersion, null, "2.4.0 sends no assetVersion");
  });

  it("telemetry stores the screen data number and asset OTA support", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post(
      "/receiver",
      telemetryPayload({ fw: "2.4.1", otaCapable: true, otaState: "idle", assetVersion: 1, assetOta: false }),
    );
    let dev = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(dev.assetVersion, 1);
    assert.equal(dev.assetOta, false);

    // Bad values are ignored; the last good ones stay.
    await hmi(t.app).post("/receiver", telemetryPayload({ fw: "2.4.1", assetVersion: "2", assetOta: "yes" }));
    dev = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(dev.assetVersion, 1);
    assert.equal(dev.assetOta, false);

    await hmi(t.app).post("/receiver", telemetryPayload({ fw: "2.5.0", assetVersion: 2, assetOta: true }));
    const res = await http(t.app).get(`/receiver/ota/status?installationId=${IDS.lotteInst}`, {
      token: tokens.admin,
    });
    assert.equal(res.statusCode, 200);
    const { device } = res.json();
    assert.equal(device.assetVersion, 2);
    assert.equal(device.assetOta, true);
  });

  it("records the progress and result of an update, newest first", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload({ fw: "2.3.6", otaCapable: true, otaState: "idle" }));

    const cmd = "cmd_20261109_004650_ftwy4v";
    for (const body of [
      { id: cmd, state: "downloading", percent: 0, fw: "2.3.6", target: "2.3.7", error: "" },
      { id: cmd, state: "verified", percent: 100, fw: "2.3.6", target: "2.3.7", error: "" },
      { id: cmd, state: "installing", percent: 100, fw: "2.3.6", target: "2.3.7", error: "" },
      // after the rollback the restored 2.3.6 reports the result of the same command
      { id: cmd, state: "rolled_back", percent: 100, fw: "2.3.6", target: "2.3.6", error: "rollback" },
    ]) {
      const res = await status(body);
      assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
    }

    const res = await http(t.app).get(`/receiver/ota/status?installationId=${IDS.lotteInst}`, {
      token: tokens.admin,
    });
    assert.equal(res.statusCode, 200);
    const { device, events } = res.json();
    assert.equal(device.fwVersion, "2.3.6");
    assert.deepEqual(
      events.map((e: { state: string }) => e.state),
      ["rolled_back", "installing", "verified", "downloading"],
    );
    assert.equal(events[0].commandId, cmd);
    assert.equal(events[0].error, "rollback");
    assert.equal(events[3].error, null, "empty error is stored as null");
  });

  it("updates the version from a confirmed report", async () => {
    await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload({ fw: "2.3.6" }));
    await status({ id: "c1", state: "confirmed", percent: 100, fw: "2.3.8", target: "2.3.8" });
    const dev = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(dev.fwVersion, "2.3.8");
  });

  it("rejects a bad key, an unknown ICCID and an unknown state", async () => {
    const { tokens } = await seedWorld(t.app);
    assert.equal((await status({ state: "confirmed" }, "wrong-key")).statusCode, 401);
    assert.equal(
      (await hmi(t.app).post("/receiver/ota/status", { iccid: "89000000000000000000", state: "confirmed" }))
        .statusCode,
      422,
    );
    assert.equal((await status({ state: "exploded" })).statusCode, 400);

    // only an admin reads the history
    const res = await http(t.app).get(`/receiver/ota/status?installationId=${IDS.lotteInst}`, {
      token: tokens.client,
    });
    assert.equal(res.statusCode, 403);
  });

  it("keeps the stage of a screen data update; an unknown stage is refused", async () => {
    const { tokens } = await seedWorld(t.app);
    const cmd = "cmd_20261112_101010_abcdef";
    const ok = await status({ id: cmd, state: "downloading", percent: 25, fw: "2.5.0", target: "2.6.0", stage: "screen" });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.json()));
    // old firmware sends no stage
    assert.equal((await status({ id: cmd, state: "verified", percent: 100, fw: "2.5.0", target: "2.6.0" })).statusCode, 200);
    assert.equal((await status({ id: cmd, state: "downloading", stage: "logo" })).statusCode, 400);

    const res = await http(t.app).get(`/receiver/ota/status?installationId=${IDS.lotteInst}`, { token: tokens.admin });
    const { events } = res.json();
    assert.equal(events.length, 2);
    assert.equal(events[0].stage, null);
    assert.equal(events[1].stage, "screen");
    assert.equal(events[1].percent, 25);
  });
});
