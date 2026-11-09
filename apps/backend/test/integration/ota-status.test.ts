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
});
