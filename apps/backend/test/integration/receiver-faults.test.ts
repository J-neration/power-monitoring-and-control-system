import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

afterEach(() => {
  delete process.env.RECEIVER_FAULTS_AUTO_PROVISION;
});

const faultState = (installationId: string, faultCode: number) =>
  prisma.moduleFaultState.findUnique({
    where: { installationId_faultCode: { installationId, faultCode } },
  });

describe("POST /receiver/faults", () => {
  it("records RAISE then CLEAR for a module", async () => {
    await seedWorld(t.app);

    const raise = await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode: 2, event: "RAISE", eventName: "OVER_TEMP" }],
    });
    assert.equal(raise.statusCode, 201);
    let state = await faultState(IDS.lotteInst, 2);
    assert.equal(state?.lastEvent, "RAISE");
    assert.equal(state?.resolvedAt, null);
    assert.equal(state?.eventName, "OVER_TEMP");

    await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode: 2, event: "CLEAR" }],
    });
    state = await faultState(IDS.lotteInst, 2);
    assert.equal(state?.lastEvent, "CLEAR");
    assert.ok(state?.resolvedAt instanceof Date);
    assert.equal(state?.repeatCount, 2);
  });

  it("accepts the legacy firmware aliases (module index, lowercase event, fault_code)", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [
        { module: 0, evt: "raise" }, // module 0 → faultCode 1
        { fault_code: 3, event: "raise", firstSeen: 1, lastSeen: 2, count: 9 }, // 레거시 키는 무시
      ],
    });
    assert.equal(res.statusCode, 201);
    assert.equal((await faultState(IDS.lotteInst, 1))?.lastEvent, "RAISE");
    assert.equal((await faultState(IDS.lotteInst, 3))?.lastEvent, "RAISE");
  });

  it("returns 400 for a faultCode outside 1–6 or an unknown event", async () => {
    await seedWorld(t.app);
    const outOfRange = await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode: 7, event: "RAISE" }],
    });
    const badEvent = await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode: 1, event: "EXPLODE" }],
    });
    const missing = await hmi(t.app).post("/receiver/faults", { iccid: IDS.lotteIccid });
    assert.equal(outOfRange.statusCode, 400);
    assert.equal(badEvent.statusCode, 400);
    assert.equal(missing.statusCode, 400);
  });

  it("requires the receiver API key", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app, "nope").post("/receiver/faults", { iccid: IDS.lotteIccid, faults: [] });
    assert.equal(res.statusCode, 401);
  });

  it("auto-provisions an unknown ICCID under the 'unknown' site by default", async () => {
    await seedWorld(t.app);
    const iccid = "89820000000000000099";
    const res = await hmi(t.app).post("/receiver/faults", { iccid, faults: [{ faultCode: 1, event: "RAISE" }] });
    assert.equal(res.statusCode, 201);
    const inst = await prisma.installation.findUniqueOrThrow({ where: { id: `lte-${iccid}` } });
    assert.equal(inst.siteId, "unknown");
    assert.equal(inst.iccid, iccid);
  });

  it("returns 404 for an unknown ICCID when auto-provisioning is off", async () => {
    await seedWorld(t.app);
    process.env.RECEIVER_FAULTS_AUTO_PROVISION = "0";
    const res = await hmi(t.app).post("/receiver/faults", {
      iccid: "89820000000000000099",
      faults: [{ faultCode: 1, event: "RAISE" }],
    });
    assert.equal(res.statusCode, 404);
    assert.equal(await prisma.installation.count({ where: { id: "lte-89820000000000000099" } }), 0);
  });
});

describe("POST /receiver/faults/critical", () => {
  it("marks the fault as critical", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).post("/receiver/faults/critical", {
      iccid: IDS.lotteIccid,
      faultCode: 4,
      event: "RAISE",
      channel: "critical",
    });
    assert.equal(res.statusCode, 201);
    const state = await faultState(IDS.lotteInst, 4);
    assert.equal(state?.criticalChannel, true);
    assert.equal(state?.lastEvent, "RAISE");
  });

  it("requires channel=critical", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).post("/receiver/faults/critical", {
      iccid: IDS.lotteIccid,
      faultCode: 4,
      event: "RAISE",
    });
    assert.equal(res.statusCode, 400);
  });
});

describe("fault acknowledge", () => {
  const raise = (faultCode: number) =>
    hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode, event: "RAISE" }],
    });

  it("acknowledges one module or all active faults", async () => {
    const { tokens } = await seedWorld(t.app);
    await raise(1);
    await raise(2);
    await raise(3);

    const one = await http(t.app).post(`/devices/${IDS.lotteInst}/faults/ack`, { faultCode: 2 }, { token: tokens.admin });
    assert.deepEqual(one.json(), { acknowledged: 1 });
    assert.equal((await faultState(IDS.lotteInst, 2))?.acknowledgedBy, "admin-reg");

    const rest = await http(t.app).post(`/devices/${IDS.lotteInst}/faults/ack`, {}, { token: tokens.admin });
    assert.deepEqual(rest.json(), { acknowledged: 2 });
  });

  it("re-activates an acknowledged fault when it is raised again", async () => {
    const { tokens } = await seedWorld(t.app);
    await raise(1);
    await http(t.app).post(`/devices/${IDS.lotteInst}/faults/ack`, { faultCode: 1 }, { token: tokens.admin });
    assert.ok((await faultState(IDS.lotteInst, 1))?.acknowledgedAt);

    await raise(1);

    assert.equal((await faultState(IDS.lotteInst, 1))?.acknowledgedAt, null);
  });

  it("returns 404 for an unknown device", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).post("/devices/missing/faults/ack", {}, { token: tokens.admin });
    assert.equal(res.statusCode, 404);
  });
});

describe("fault history", () => {
  it("is the same through /devices/:id/faults and /receiver/faults?iccid=", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode: 5, event: "RAISE" }],
    });

    const byDevice = (await http(t.app).get(`/devices/${IDS.lotteInst}/faults`, { token: tokens.admin })).json().faults;
    const byIccid = (await http(t.app).get(`/receiver/faults?iccid=${IDS.lotteIccid}`, { token: tokens.admin })).json()
      .faults;

    assert.ok(byDevice.length > 0);
    assert.deepEqual(byIccid, byDevice);
  });

  /** 테스트 요청은 수 ms 간격이라, 지금까지 받은 로그를 과거로 밀어 실제 시간 간격을 흉내 낸다. */
  const ageLogs = (ms: number) =>
    prisma.$executeRaw`UPDATE "ModuleFaultLog" SET "occurredAt" = "occurredAt" - (${ms} * interval '1 millisecond')`;

  it("keeps every occurrence and tells a real clear from a code update", async () => {
    const { tokens } = await seedWorld(t.app);
    const send = (faults: unknown[]) => hmi(t.app).post("/receiver/faults", { iccid: IDS.lotteIccid, faults });

    await send([{ faultCode: 2, event: "RAISE", eventName: "F11" }]);
    await send([{ faultCode: 2, event: "CLEAR", eventName: "" }]); // 진짜 해제
    await ageLogs(60_000);
    await send([{ faultCode: 2, event: "RAISE", eventName: "F3" }]);
    await ageLogs(60_000);
    // fault 중 코드가 바뀌면 HMI 는 CLEAR 후 새 RAISE 를 한 배치로 보낸다 → 해제가 아니라 갱신
    await send([
      { faultCode: 2, event: "CLEAR", eventName: "" },
      { faultCode: 2, event: "RAISE", eventName: "F5" },
    ]);

    assert.equal(await prisma.moduleFaultLog.count(), 5);

    const faults = (await http(t.app).get(`/devices/${IDS.lotteInst}/faults`, { token: tokens.admin })).json()
      .faults as Array<{ module: number; eventName: string; active: boolean; endReason: string | null }>;

    assert.deepEqual(
      faults.map((f) => [f.module, f.eventName, f.active, f.endReason]),
      [
        [1, "F5", true, null],
        [1, "F3", false, "updated"],
        [1, "F11", false, "cleared"],
      ],
    );
  });

  it("stays active until CLEAR even if nothing arrives for days", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver/faults", {
      iccid: IDS.lotteIccid,
      faults: [{ faultCode: 3, event: "RAISE", eventName: "F22" }],
    });
    await ageLogs(3 * 24 * 60 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "ModuleFaultState" SET "updatedAt" = now() - interval '3 days'`;

    const faults = (await http(t.app).get(`/devices/${IDS.lotteInst}/faults`, { token: tokens.admin })).json()
      .faults as Array<{ eventName: string; active: boolean }>;

    assert.deepEqual(
      faults.map((f) => [f.eventName, f.active]),
      [["F22", true]],
    );
  });

  it("marks only the latest occurrence as acknowledged", async () => {
    const { tokens } = await seedWorld(t.app);
    const send = (faults: unknown[]) => hmi(t.app).post("/receiver/faults", { iccid: IDS.lotteIccid, faults });

    await send([{ faultCode: 1, event: "RAISE", eventName: "F2" }]);
    await send([{ faultCode: 1, event: "CLEAR" }]);
    await send([{ faultCode: 1, event: "RAISE", eventName: "F4" }]);
    await http(t.app).post(`/devices/${IDS.lotteInst}/faults/ack`, { faultCode: 1 }, { token: tokens.admin });

    const faults = (await http(t.app).get(`/devices/${IDS.lotteInst}/faults`, { token: tokens.admin })).json()
      .faults as Array<{ eventName: string; active: boolean; acknowledgedAt: string | null }>;

    assert.deepEqual(
      faults.map((f) => [f.eventName, f.active, f.acknowledgedAt != null]),
      [
        ["F4", false, true],
        ["F2", false, false],
      ],
    );
  });
});
