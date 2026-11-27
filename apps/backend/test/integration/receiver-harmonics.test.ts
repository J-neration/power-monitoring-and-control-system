/**
 * 차수별 고조파 전류·전압 (HMI 저장소 docs/LTE_HARMONIC_DATA_PLAN.md 3장, 3-1장).
 *   - HMI: POST /receiver/harmonics (x-api-key, iccid). volt 는 새 펌웨어만 보낸다.
 *   - 웹: GET /devices/:id/harmonics, GET /devices/:id/harmonics/history
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

const ORDERS = Array.from({ length: 25 }, (_, i) => i * 2 + 1);
const arr = (first: number, rest: number) => ORDERS.map((o) => (o === 1 ? first : rest));

const body = (extra: Record<string, unknown> = {}) => ({
  iccid: IDS.lotteIccid,
  unit: "0.01A",
  source: "hourly",
  orders: ORDERS,
  uncomp: { a: arr(10000, 300), b: arr(10000, 310), c: arr(10000, 320) },
  comp: { a: arr(10000, 30), b: arr(10000, 31), c: arr(10000, 32) },
  ...extra,
});

const volt = (extra: Record<string, unknown> = {}) => ({
  unit: "0.1V",
  a: arr(2203, 45),
  b: arr(2210, 46),
  c: arr(2195, 47),
  ...extra,
});

describe("receiver harmonics", () => {
  it("old firmware (no volt) is stored as before, volt = null", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await hmi(t.app).post("/receiver/harmonics", body());
    assert.equal(res.statusCode, 200, JSON.stringify(res.json()));

    const row = await prisma.harmonicRecord.findFirstOrThrow({ where: { installationId: IDS.lotteInst } });
    assert.deepEqual(row.voltA, []);
    assert.equal(row.voltRecordedAt, null);

    const api = await http(t.app).get(`/devices/${IDS.lotteInst}/harmonics?hours=1`, { token: tokens.admin });
    assert.equal(api.statusCode, 200);
    assert.equal(api.json().latest.volt, null);
    assert.equal(api.json().latest.uncomp.a[2], 300);
  });

  it("stores voltage harmonics with their own read time", async () => {
    const { tokens } = await seedWorld(t.app);
    const ts = Math.floor(Date.now() / 1000) - 60;
    const res = await hmi(t.app).post("/receiver/harmonics", body({ ts, volt: volt({ ts: ts + 2 }) }));
    assert.equal(res.statusCode, 200, JSON.stringify(res.json()));

    const api = await http(t.app).get(`/devices/${IDS.lotteInst}/harmonics?hours=1`, { token: tokens.admin });
    const latest = api.json().latest;
    assert.deepEqual(latest.volt.a.slice(0, 3), [2203, 45, 45]);
    assert.equal(latest.volt.c[0], 2195);
    assert.equal(new Date(latest.volt.recordedAt).getTime() - new Date(latest.recordedAt).getTime(), 2000);

    // history: the picked order in V next to the currents in A
    const hist = await http(t.app).get(`/devices/${IDS.lotteInst}/harmonics/history?period=day&order=5`, {
      token: tokens.admin,
    });
    assert.equal(hist.statusCode, 200, JSON.stringify(hist.json()));
    const { points, voltUnit } = hist.json();
    assert.equal(voltUnit, "V");
    assert.equal(points.length, 1);
    assert.deepEqual(points[0].volt, { a: 4.5, b: 4.6, c: 4.7 });
    assert.deepEqual(points[0].uncomp, { a: 3, b: 3.1, c: 3.2 });
  });

  it("rejects a voltage array that does not match orders", async () => {
    await seedWorld(t.app);
    const res = await hmi(t.app).post("/receiver/harmonics", body({ volt: volt({ a: [2203, 45] }) }));
    assert.equal(res.statusCode, 400);
    assert.equal(await prisma.harmonicRecord.count({ where: { installationId: IDS.lotteInst } }), 0);
  });
});
