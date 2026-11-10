import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, INSPECTION, seedInspection, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp();

/** 출고검사 계정이 만든 설치지점 id 를 돌려준다. */
const register = async (token: string, body: Record<string, unknown>) =>
  http(t.app).post("/inspection/installations", body, { token });

describe("INSPECTOR (출고검사) account", () => {
  it("sees every site, but customer-site ICCIDs stay hidden", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    const api = http(t.app);

    const sites = (await api.get("/sites", { token: inspectorToken })).json().sites;
    assert.deepEqual(
      sites.map((s: { siteId: string }) => s.siteId).sort(),
      [IDS.gsSite, IDS.lotteSite, INSPECTION.site].sort(),
    );
    const lotte = sites.find((s: { siteId: string }) => s.siteId === IDS.lotteSite);
    assert.equal("iccid" in lotte.installations[0], false);

    const lotteSite = await api.get(`/sites/${IDS.lotteSite}`, { token: inspectorToken });
    assert.equal(lotteSite.statusCode, 200);
    assert.equal("iccid" in lotteSite.json().site.installations[0], false);

    const device = await api.get(`/devices/${IDS.lotteInst}`, { token: inspectorToken });
    assert.equal(device.statusCode, 200);
    assert.equal("iccid" in device.json().device.installation, false);

    const devices = (await api.get("/devices", { token: inspectorToken })).json().devices;
    for (const d of devices) assert.equal("iccid" in d.installation, false, d.installationId);

    assert.equal((await api.get(`/devices/${IDS.lotteInst}/faults`, { token: inspectorToken })).statusCode, 200);
  });

  it("registers a device by ICCID, sees the ICCID, and receives HMI telemetry on it", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    const api = http(t.app);

    // 바코드·수기 입력처럼 공백·하이픈이 섞여도 정규화해서 저장한다
    const res = await register(inspectorToken, { iccid: "8982 0000 0000-0000 0033", label: "S/N 001" });
    assert.equal(res.statusCode, 201, res.body);
    const id = res.json().installation.id as string;
    assert.equal(res.json().installation.iccid, INSPECTION.iccid);

    const posted = await hmi(t.app).post("/receiver", telemetryPayload({ iccid: INSPECTION.iccid }));
    assert.equal(posted.statusCode, 200, posted.body);

    const site = (await api.get(`/sites/${INSPECTION.site}`, { token: inspectorToken })).json().site;
    assert.equal(site.installations.length, 1);
    assert.equal(site.installations[0].id, id);
    assert.equal(site.installations[0].label, "S/N 001");
    assert.equal(site.installations[0].iccid, INSPECTION.iccid);

    const device = (await api.get(`/devices/${id}`, { token: inspectorToken })).json().device;
    assert.equal(device.installation.iccid, INSPECTION.iccid);
    assert.ok(site.installations[0].device.lastSeenAt, "telemetry should land on the inspection installation");

    assert.equal((await api.get(`/devices/${id}/faults`, { token: inspectorToken })).statusCode, 200);
  });

  it("defaults the label to the ICCID tail", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    const res = await register(inspectorToken, { iccid: INSPECTION.iccid });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().installation.label, "ICCID …0033");
  });

  it("rejects a malformed ICCID", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    for (const iccid of ["", "1234", "89820000ABC0000000033"]) {
      const res = await register(inspectorToken, { iccid });
      assert.equal(res.statusCode, 400, `iccid=${iccid} → ${res.statusCode}`);
    }
  });

  it("refuses an ICCID already used at a customer site without revealing which", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    const res = await register(inspectorToken, { iccid: IDS.lotteIccid });
    assert.equal(res.statusCode, 409);
    assert.doesNotMatch(res.body, new RegExp(`${IDS.lotteInst}|${IDS.lotteSite}`));
  });

  it("refuses a duplicate in its own list", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    assert.equal((await register(inspectorToken, { iccid: INSPECTION.iccid })).statusCode, 201);
    assert.equal((await register(inspectorToken, { iccid: INSPECTION.iccid })).statusCode, 409);
  });

  it("releases the ICCID so an admin can move it to the real site", async () => {
    const { inspectorToken, tokens } = await seedInspection(t.app);
    const api = http(t.app);
    const id = (await register(inspectorToken, { iccid: INSPECTION.iccid })).json().installation.id;

    // 해제 전에는 관리자가 실제 현장에 등록할 수 없다
    const blocked = await api.patch(`/admin/installations/${IDS.gsInst}/iccid`, { iccid: INSPECTION.iccid }, { token: tokens.admin });
    assert.equal(blocked.statusCode, 409);

    const released = await api.patch(`/inspection/installations/${id}/iccid`, { iccid: null }, { token: inspectorToken });
    assert.equal(released.statusCode, 200, released.body);

    const moved = await api.patch(`/admin/installations/${IDS.gsInst}/iccid`, { iccid: INSPECTION.iccid }, { token: tokens.admin });
    assert.equal(moved.statusCode, 200, moved.body);
  });

  it("can delete its own inspection installation", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    const api = http(t.app);
    const id = (await register(inspectorToken, { iccid: INSPECTION.iccid })).json().installation.id;

    assert.equal((await api.delete(`/inspection/installations/${id}`, { token: inspectorToken })).statusCode, 204);
    const site = (await api.get(`/sites/${INSPECTION.site}`, { token: inspectorToken })).json().site;
    assert.equal(site.installations.length, 0);
  });

  it("cannot touch installations outside the inspection site", async () => {
    const { inspectorToken, tokens } = await seedInspection(t.app);
    const api = http(t.app);

    const patch = await api.patch(`/inspection/installations/${IDS.lotteInst}/iccid`, { iccid: null }, { token: inspectorToken });
    assert.equal(patch.statusCode, 404);
    const del = await api.delete(`/inspection/installations/${IDS.lotteInst}`, { token: inspectorToken });
    assert.equal(del.statusCode, 404);

    const site = (await api.get(`/sites/${IDS.lotteSite}`, { token: tokens.admin })).json().site;
    assert.equal(site.installations[0].iccid, IDS.lotteIccid, "customer ICCID must be untouched");
  });

  it("cannot control or configure devices, nor use admin APIs", async () => {
    const { inspectorToken } = await seedInspection(t.app);
    const api = http(t.app);
    const id = (await register(inspectorToken, { iccid: INSPECTION.iccid })).json().installation.id;

    const forbidden: Array<[string, string]> = [
      ["GET", `/devices/${id}/settings`],
      ["POST", `/devices/${id}/faults/ack`],
      ["POST", `/devices/${id}/viewing/start`],
      ["POST", "/receiver/commands/create"],
      ["GET", "/admin/users"],
      ["POST", `/admin/sites/${INSPECTION.site}/installations`],
      ["PATCH", `/admin/installations/${id}/iccid`],
    ];
    for (const [method, url] of forbidden) {
      const res = await t.app.inject({
        method: method as "GET",
        url,
        payload: method === "GET" ? undefined : {},
        headers: { authorization: `Bearer ${inspectorToken}` },
      });
      assert.equal(res.statusCode, 403, `INSPECTOR ${method} ${url} → ${res.statusCode}`);
    }
  });

  it("is the only role allowed on /inspection", async () => {
    const { tokens } = await seedInspection(t.app);
    for (const [role, token] of Object.entries(tokens)) {
      const res = await register(token, { iccid: INSPECTION.iccid });
      assert.equal(res.statusCode, 403, `${role} → ${res.statusCode}`);
    }
    assert.equal((await register("", { iccid: INSPECTION.iccid })).statusCode, 401);
  });
});

describe("admin creates an INSPECTOR account", () => {
  it("requires an existing inspection site", async () => {
    const { tokens } = await seedInspection(t.app);
    const api = http(t.app);
    const base = { username: "inspector-new", role: "INSPECTOR", initialPassword: "Inspect#2026!" };

    assert.equal((await api.post("/admin/users", base, { token: tokens.admin })).statusCode, 400);
    assert.equal((await api.post("/admin/users", { ...base, siteId: "nope" }, { token: tokens.admin })).statusCode, 400);

    const ok = await api.post("/admin/users", { ...base, siteId: INSPECTION.site }, { token: tokens.admin });
    assert.equal(ok.statusCode, 201, ok.body);
    assert.equal(ok.json().user.role, "INSPECTOR");

    const login = await api.post("/auth/login", { username: "inspector-new", password: "Inspect#2026!" });
    assert.equal(login.statusCode, 200, login.body);
  });
});
