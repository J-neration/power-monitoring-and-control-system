import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp();

afterEach(() => {
  delete process.env.RECEIVER_REQUIRE_ICCID;
});

describe("POST /receiver — authentication", () => {
  it("rejects a missing or wrong x-api-key with 401 and stores nothing", async () => {
    await seedWorld(t.app);

    const missing = await t.app.inject({ method: "POST", url: "/receiver", payload: telemetryPayload() });
    const wrong = await hmi(t.app, "wrong-key").post("/receiver", telemetryPayload());

    assert.equal(missing.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.equal(await prisma.telemetryRecord.count(), 0);
  });

  // 회귀: 잘못된 키 처리에서 응답을 두 번 보내 ERR_HTTP_HEADERS_SENT 로 프로세스가 죽은 적이 있다.
  it("keeps serving after a burst of bad-key requests", async () => {
    await seedWorld(t.app);
    for (let i = 0; i < 5; i++) {
      await hmi(t.app, "wrong-key").post("/receiver", telemetryPayload());
      await hmi(t.app, "wrong-key").get(`/receiver/commands?iccid=${IDS.lotteIccid}`);
    }
    const ok = await hmi(t.app).post("/receiver", telemetryPayload());
    assert.equal(ok.statusCode, 200);
  });
});

describe("POST /receiver — telemetry ingest", () => {
  it("updates the device snapshot and appends a history record", async () => {
    await seedWorld(t.app);

    const res = await hmi(t.app).post("/receiver", telemetryPayload());

    assert.equal(res.statusCode, 200);
    const device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    // HMI 는 숫자를 문자열로 보내기도 한다 — 숫자로 저장돼야 한다.
    assert.equal(device.vL1, 221.5);
    assert.equal(device.csq, 21);
    assert.equal(device.rsrp, -84);
    assert.deepEqual(device.moduleStatus, [2, 2, 0]);
    assert.deepEqual(device.areaTemp, [31.5, 32]);
    assert.ok(device.lastSeenAt instanceof Date);

    assert.equal(await prisma.telemetryRecord.count({ where: { installationId: IDS.lotteInst } }), 1);
  });

  it("answers with a compact ACK that does not echo the payload", async () => {
    await seedWorld(t.app);

    const res = await hmi(t.app).post("/receiver", telemetryPayload());
    const ack = res.json();

    assert.equal(ack.ok, true);
    assert.equal(ack.adminSessionActive, false);
    assert.equal(ack.webSettingsActive, false);
    assert.deepEqual(ack.identity, { installationId: IDS.lotteInst, resolvedVia: "iccid" });
    assert.equal(ack.device.installationId, IDS.lotteInst);
    // HMI 모뎀 버퍼(~2KB)를 넘기면 응답이 잘린다.
    assert.equal(ack.vL1, undefined);
    assert.ok(res.body.length < 1024, `ACK is ${res.body.length} bytes`);
  });

  it("matches a 19-digit ICCID to the 20-digit one registered in the admin UI", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).post("/receiver", telemetryPayload({ iccid: IDS.lotteIccid.slice(0, 19) }));
    assert.deepEqual(res.json().identity, { installationId: IDS.lotteInst, resolvedVia: "iccid" });
  });

  it("matches a 20-digit modem ICCID to the 19-digit number printed on the SIM case", async () => {
    await seedWorld(t.app);
    await prisma.installation.update({
      where: { id: IDS.gsInst },
      data: { iccid: IDS.gsIccid.slice(0, 19) },
    });
    const res = await hmi(t.app).post("/receiver", telemetryPayload({ iccid: IDS.gsIccid }));
    assert.deepEqual(res.json().identity, { installationId: IDS.gsInst, resolvedVia: "iccid" });
  });

  it("matches an ICCID padded with a trailing F (AT+CCID)", async () => {
    await seedWorld(t.app);
    await prisma.installation.update({
      where: { id: IDS.gsInst },
      data: { iccid: IDS.gsIccid.slice(0, 19) },
    });
    const res = await hmi(t.app).post("/receiver", telemetryPayload({ iccid: `${IDS.gsIccid.slice(0, 19)}F` }));
    assert.equal(res.json().identity.installationId, IDS.gsInst);
  });

  it("matches an ICCID written with spaces and hyphens", async () => {
    await seedWorld(t.app);
    const spaced = IDS.lotteIccid.replace(/(\d{4})/g, "$1 ").trim().replace(" ", "-");
    const res = await hmi(t.app).post("/receiver", telemetryPayload({ iccid: spaced }));
    assert.equal(res.json().identity.installationId, IDS.lotteInst);
  });

  it("falls back to device_id when no ICCID matches (legacy firmware)", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).post(
      "/receiver",
      telemetryPayload({ iccid: undefined, device_id: IDS.gsInst }),
    );
    assert.deepEqual(res.json().identity, { installationId: IDS.gsInst, resolvedVia: "explicit" });
  });

  it("parks a completely unknown device under the 'unknown' site", async () => {
    await seedWorld(t.app);

    await hmi(t.app).post("/receiver", telemetryPayload({ iccid: undefined, device_id: "NEVER-SEEN-01" }));

    const inst = await prisma.installation.findUniqueOrThrow({ where: { id: "NEVER-SEEN-01" } });
    assert.equal(inst.siteId, "unknown");
  });

  it("accepts a moduleStatus array sent as a JSON string", async () => {
    await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload({ moduleStatus: "[2,2,2]" }));
    const device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.deepEqual(device.moduleStatus, [2, 2, 2]);
  });

  it("uses the HMI timestamp (seconds or milliseconds) as the measurement time", async () => {
    await seedWorld(t.app);
    const at = new Date("2026-10-01T03:00:00Z");

    await hmi(t.app).post("/receiver", telemetryPayload({ timestamp: at.getTime() / 1000 }));
    let device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(device.lastSeenAt?.toISOString(), at.toISOString());

    const later = new Date("2026-10-01T03:10:00Z");
    await hmi(t.app).post("/receiver", telemetryPayload({ ts: later.getTime() }));
    device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(device.lastSeenAt?.toISOString(), later.toISOString());
  });

  it("ignores an implausible HMI clock and uses the server time", async () => {
    await seedWorld(t.app);
    const before = Date.now();
    await hmi(t.app).post("/receiver", telemetryPayload({ timestamp: 12345 }));
    const device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.ok(device.lastSeenAt!.getTime() >= before - 1000);
  });

  it("keeps a known model from the payload and falls back to psvg for unknown ones", async () => {
    await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload({ model: "PSTA" }));
    assert.equal((await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } })).model, "psta");

    await hmi(t.app).post("/receiver", telemetryPayload({ iccid: IDS.gsIccid, model: "toaster" }));
    assert.equal((await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.gsInst } })).model, "psvg");
  });

  it("does not wipe stored values that a later payload omits", async () => {
    await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload());
    await hmi(t.app).post("/receiver", { iccid: IDS.lotteIccid, vL2: 225 });

    const device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.equal(device.vL2, 225);
    assert.equal(device.vL1, 221.5);
    assert.deepEqual(device.moduleStatus, [2, 2, 0]);
  });

  it("stores nothing for an unparsable body but still answers", async () => {
    await seedWorld(t.app);
    const res = await t.app.inject({
      method: "POST",
      url: "/receiver",
      headers: { "x-api-key": "integration-test-receiver-key", "content-type": "text/plain" },
      payload: "this is not json",
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().device, null);
    assert.equal(await prisma.telemetryRecord.count(), 0);
  });

  it("saves module faults sent inside the telemetry payload", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post(
      "/receiver",
      telemetryPayload({ faults: [{ module: 1, desc: "IGBT over temp" }, { module: "bad" }] }),
    );

    const faults = (await http(t.app).get(`/devices/${IDS.lotteInst}/faults`, { token: tokens.admin })).json().faults;
    assert.ok(faults.some((f: { module: number; desc: string }) => f.module === 1 && f.desc === "IGBT over temp"));
    assert.equal(await prisma.faultEvent.count(), 1);
  });
});

describe("POST /receiver — RECEIVER_REQUIRE_ICCID", () => {
  it("refuses device_id-only payloads with 422 when the env flag is on", async () => {
    await seedWorld(t.app);
    process.env.RECEIVER_REQUIRE_ICCID = "1";

    const explicit = await hmi(t.app).post("/receiver", telemetryPayload({ iccid: undefined, device_id: IDS.gsInst }));
    const viaIccid = await hmi(t.app).post("/receiver", telemetryPayload());

    assert.equal(explicit.statusCode, 422);
    assert.equal(viaIccid.statusCode, 200);
  });
});

describe("telemetry → dashboard API", () => {
  it("derives device status from the worst installed module", async () => {
    const { tokens } = await seedWorld(t.app);
    const statusAfter = async (moduleStatus: number[]) => {
      await hmi(t.app).post("/receiver", telemetryPayload({ moduleStatus }));
      return (await http(t.app).get(`/devices/${IDS.lotteInst}`, { token: tokens.admin })).json().device.status;
    };

    assert.equal(await statusAfter([2, 2, 2]), "running");
    assert.equal(await statusAfter([2, 0, 2]), "standby");
    assert.equal(await statusAfter([2, 3, 0]), "fault");
    assert.equal(await statusAfter([2, 2, 4]), "running"); // 4 = 미설치 슬롯은 무시
    assert.equal(await statusAfter([4, 4, 4]), "offline");
  });

  it("rolls device status up to the site", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload({ moduleStatus: [2, 3, 2] }));

    const sites = (await http(t.app).get("/sites", { token: tokens.admin })).json().sites;
    const lotte = sites.find((s: { siteId: string }) => s.siteId === IDS.lotteSite);
    assert.equal(lotte.status, "fault");
  });

  it("flags commLost only after the device has reported and then gone quiet", async () => {
    const { tokens } = await seedWorld(t.app);
    const get = async () =>
      (await http(t.app).get(`/devices/${IDS.lotteInst}`, { token: tokens.admin })).json().device.commLost;

    assert.equal(await get(), false); // 한 번도 수신 안 함 → 끊김 아님

    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    await hmi(t.app).post("/receiver", telemetryPayload({ timestamp: hourAgo }));
    assert.equal(await get(), true);

    await hmi(t.app).post("/receiver", telemetryPayload());
    assert.equal(await get(), false);
  });

  it("serves readings in time order and honours the hours window", async () => {
    const { tokens } = await seedWorld(t.app);
    const now = Math.floor(Date.now() / 1000);
    for (const [ago, v] of [[3 * 3600, 210], [1800, 220], [60, 230]]) {
      await hmi(t.app).post("/receiver", telemetryPayload({ timestamp: now - ago, vL1: v }));
    }

    const last2h = (await http(t.app).get(`/devices/${IDS.lotteInst}/readings?hours=2`, { token: tokens.admin }))
      .json().readings;
    assert.deepEqual(last2h.map((r: { vL1: number }) => r.vL1), [220, 230]);

    const last24h = (await http(t.app).get(`/devices/${IDS.lotteInst}/readings`, { token: tokens.admin }))
      .json().readings;
    assert.deepEqual(last24h.map((r: { vL1: number }) => r.vL1), [210, 220, 230]);
  });

  it("builds watch facts for the device", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload());
    const res = await http(t.app).get(`/devices/${IDS.lotteInst}/watch-facts?hours=24`, { token: tokens.client });
    assert.equal(res.statusCode, 200);
    assert.equal(typeof res.json(), "object");
  });
});
