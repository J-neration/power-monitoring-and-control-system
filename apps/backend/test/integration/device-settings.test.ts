import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

const v3v4Snapshot = (overrides: Record<string, unknown> = {}) => ({
  iccid: IDS.lotteIccid,
  moduleType: "v3v4",
  numOfMods: 2,
  moduleCapacity: [50, 50],
  settings: {
    basic: [
      { mod: 0, reactiveSwitch: 1, harmSwitch: 0, imbSwitch: 1, ectp: 1000, k0: 1, ccr: 100, tpf: 0.95, junk: 7 },
      { mod: 1, reactiveSwitch: 1, harmSwitch: 1, imbSwitch: 0, ectp: 1000, k0: 1, ccr: 100, tpf: 0.95 },
    ],
  },
  ...overrides,
});

describe("POST /receiver/settings → GET /devices/:id/settings", () => {
  it("stores the HMI snapshot and serves it to the admin settings tab", async () => {
    const { tokens } = await seedWorld(t.app);

    const upload = await hmi(t.app).post("/receiver/settings", v3v4Snapshot());
    assert.equal(upload.statusCode, 200);

    const res = await http(t.app).get(`/devices/${IDS.lotteInst}/settings`, { token: tokens.admin });
    assert.equal(res.statusCode, 200);
    const { settings, adminSessionActive } = res.json();
    assert.equal(adminSessionActive, false);
    assert.equal(settings.moduleType, "v3v4");
    assert.equal(settings.numOfMods, 2);
    assert.equal(settings.basic.length, 2);
    assert.equal(settings.basic[0].tpf, 0.95);
  });

  it("drops keys that do not belong to the module type", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver/settings", v3v4Snapshot());

    const { settings } = (await http(t.app).get(`/devices/${IDS.lotteInst}/settings`, { token: tokens.admin })).json();
    assert.equal(settings.basic[0].junk, undefined);
  });

  it("copies the rated module capacity onto the device", async () => {
    await seedWorld(t.app);
    await hmi(t.app).post("/receiver/settings", v3v4Snapshot());
    const device = await prisma.device.findUniqueOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.deepEqual(device.moduleCapacity, [50, 50]);
  });

  it("overwrites the previous snapshot", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver/settings", v3v4Snapshot());
    await hmi(t.app).post(
      "/receiver/settings",
      v3v4Snapshot({ numOfMods: 1, settings: { basic: [{ mod: 0, tpf: 0.9 }] } }),
    );

    const { settings } = (await http(t.app).get(`/devices/${IDS.lotteInst}/settings`, { token: tokens.admin })).json();
    assert.equal(settings.numOfMods, 1);
    assert.equal(settings.basic[0].tpf, 0.9);
    assert.equal(await prisma.installationDeviceSettings.count(), 1);
  });

  it("returns settings: null before the HMI has uploaded anything", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).get(`/devices/${IDS.lotteInst}/settings`, { token: tokens.admin });
    assert.equal(res.json().settings, null);
  });

  it("rejects an unknown module type and a malformed body", async () => {
    await seedWorld(t.app);
    const badType = await hmi(t.app).post("/receiver/settings", v3v4Snapshot({ moduleType: "v9" }));
    const noBasic = await hmi(t.app).post("/receiver/settings", { iccid: IDS.lotteIccid, moduleType: "v5" });
    assert.equal(badType.statusCode, 400);
    assert.equal(badType.json().code, "INVALID_MODULE_TYPE");
    assert.equal(noBasic.statusCode, 400);
  });

  it("requires the receiver API key", async () => {
    await seedWorld(t.app);
    assert.equal((await hmi(t.app, "nope").post("/receiver/settings", v3v4Snapshot())).statusCode, 401);
  });
});

describe("setBasic command uses the snapshot's module type", () => {
  it("keeps only the fields valid for the stored module type", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver/settings", v3v4Snapshot());

    const res = await http(t.app).post(
      "/receiver/commands/create",
      {
        installationId: IDS.lotteInst,
        module: 0,
        power: "setBasic",
        fields: { tpf: 0.97, moduleCapacity: 999, compMode: 1 },
      },
      { token: tokens.admin },
    );

    assert.equal(res.statusCode, 201);
    // moduleCapacity 는 읽기 전용, compMode 는 v5 전용 → 빠진다.
    assert.deepEqual(res.json().command.fields, { tpf: 0.97 });

    const polled = (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();
    assert.deepEqual(polled.fields, { tpf: 0.97 });
  });
});
