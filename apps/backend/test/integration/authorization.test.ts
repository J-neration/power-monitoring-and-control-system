import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

/**
 * 관리자 전용 엔드포인트 전체. 새 관리자 API 를 추가하면 여기에도 넣는다 —
 * 빠뜨리면 CLIENT/SITE 계정이 호출할 수 있게 열려도 테스트가 잡지 못한다.
 */
const ADMIN_ONLY: Array<[method: "GET" | "POST" | "PATCH" | "DELETE", url: string]> = [
  ["GET", "/admin/users"],
  ["POST", "/admin/users"],
  ["PATCH", "/admin/users/some-id"],
  ["DELETE", "/admin/users/some-id"],
  ["POST", "/admin/sites"],
  ["PATCH", `/admin/sites/${IDS.lotteSite}`],
  ["DELETE", `/admin/sites/${IDS.lotteSite}`],
  ["POST", `/admin/sites/${IDS.lotteSite}/installations`],
  ["DELETE", `/admin/installations/${IDS.lotteInst}`],
  ["PATCH", `/admin/installations/${IDS.lotteInst}/iccid`],
  ["GET", "/admin/registry/clients"],
  ["POST", "/admin/registry/clients"],
  ["PATCH", "/admin/registry/clients/some-id"],
  ["DELETE", "/admin/registry/clients/some-id"],
  ["GET", "/admin/registry/roles"],
  ["PATCH", "/admin/registry/roles/CLIENT"],
  ["GET", `/devices/${IDS.lotteInst}/faults`],
  ["POST", `/devices/${IDS.lotteInst}/faults/ack`],
  ["GET", `/devices/${IDS.lotteInst}/settings`],
  ["POST", "/devices/admin-session/stop-all"],
  ["POST", `/devices/${IDS.lotteInst}/viewing/start`],
  ["POST", `/devices/${IDS.lotteInst}/viewing/stop`],
  ["GET", "/receiver/faults"],
  ["POST", "/receiver/commands/create"],
  ["GET", `/receiver/commands/history?installationId=${IDS.lotteInst}`],
];

/** 로그인한 누구나 (단, 범위 안의 데이터만). */
const AUTHENTICATED: string[] = [
  "/sites",
  `/sites/${IDS.lotteSite}`,
  "/devices",
  `/devices/${IDS.lotteInst}`,
  `/devices/${IDS.lotteInst}/readings`,
  `/devices/${IDS.lotteInst}/watch-facts`,
  `/devices/${IDS.lotteInst}/viewing/status`,
];

const call = (method: string, url: string, token?: string) =>
  t.app.inject({
    method: method as "GET",
    url,
    payload: method === "GET" || method === "DELETE" ? undefined : {},
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("admin-only endpoints", () => {
  it("reject anonymous requests with 401", async () => {
    await seedWorld(t.app);
    for (const [method, url] of ADMIN_ONLY) {
      const res = await call(method, url);
      assert.equal(res.statusCode, 401, `${method} ${url} → ${res.statusCode}`);
    }
  });

  it("reject CLIENT and SITE accounts with 403", async () => {
    const { tokens } = await seedWorld(t.app);
    for (const [role, token] of [["CLIENT", tokens.client], ["SITE", tokens.site]] as const) {
      for (const [method, url] of ADMIN_ONLY) {
        const res = await call(method, url, token);
        assert.equal(res.statusCode, 403, `${role} ${method} ${url} → ${res.statusCode}`);
      }
    }
  });

  it("let ADMIN through the guard", async () => {
    const { tokens } = await seedWorld(t.app);
    for (const [method, url] of ADMIN_ONLY) {
      const res = await call(method, url, tokens.admin);
      assert.ok(![401, 403].includes(res.statusCode), `ADMIN ${method} ${url} → ${res.statusCode}`);
    }
  });
});

describe("authenticated endpoints", () => {
  it("reject anonymous requests with 401", async () => {
    await seedWorld(t.app);
    for (const url of AUTHENTICATED) {
      const res = await call("GET", url);
      assert.equal(res.statusCode, 401, `GET ${url} → ${res.statusCode}`);
    }
  });

  it("reject a malformed Authorization header", async () => {
    await seedWorld(t.app);
    const res = await t.app.inject({
      method: "GET",
      url: "/sites",
      headers: { authorization: "Token abc" },
    });
    assert.equal(res.statusCode, 401);
  });
});

describe("data scoping", () => {
  it("ADMIN sees every site", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).get("/sites", { token: tokens.admin });
    const ids = res.json().sites.map((s: { siteId: string }) => s.siteId).sort();
    assert.deepEqual(ids, [IDS.gsSite, IDS.lotteSite]);
  });

  it("CLIENT sees only its construction company's sites and devices", async () => {
    const { tokens } = await seedWorld(t.app);

    const sites = (await http(t.app).get("/sites", { token: tokens.client })).json().sites;
    assert.deepEqual(sites.map((s: { siteId: string }) => s.siteId), [IDS.lotteSite]);

    const devices = (await http(t.app).get("/devices", { token: tokens.client })).json().devices;
    assert.deepEqual(devices.map((d: { installationId: string }) => d.installationId), [IDS.lotteInst]);
  });

  it("SITE sees only its own site and devices", async () => {
    const { tokens } = await seedWorld(t.app);

    const sites = (await http(t.app).get("/sites", { token: tokens.site })).json().sites;
    assert.deepEqual(sites.map((s: { siteId: string }) => s.siteId), [IDS.gsSite]);

    const devices = (await http(t.app).get("/devices", { token: tokens.site })).json().devices;
    assert.deepEqual(devices.map((d: { installationId: string }) => d.installationId), [IDS.gsInst]);
  });

  it("answers 404 (not 403) for another company's site or device so its existence is not leaked", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);

    assert.equal((await api.get(`/sites/${IDS.gsSite}`, { token: tokens.client })).statusCode, 404);
    assert.equal((await api.get(`/devices/${IDS.gsInst}`, { token: tokens.client })).statusCode, 404);
    assert.equal((await api.get(`/devices/${IDS.gsInst}/readings`, { token: tokens.client })).statusCode, 404);
    assert.equal((await api.get(`/devices/${IDS.gsInst}/watch-facts`, { token: tokens.client })).statusCode, 404);

    assert.equal((await api.get(`/sites/${IDS.lotteSite}`, { token: tokens.site })).statusCode, 404);
    assert.equal((await api.get(`/devices/${IDS.lotteInst}`, { token: tokens.site })).statusCode, 404);
  });

  it("exposes the SIM ICCID only to ADMIN", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);

    const adminSite = (await api.get(`/sites/${IDS.lotteSite}`, { token: tokens.admin })).json().site;
    assert.equal(adminSite.installations[0].iccid, IDS.lotteIccid);

    const clientSite = (await api.get(`/sites/${IDS.lotteSite}`, { token: tokens.client })).json().site;
    assert.equal("iccid" in clientSite.installations[0], false);

    const clientList = (await api.get("/sites", { token: tokens.client })).json().sites;
    assert.equal("iccid" in clientList[0].installations[0], false);
  });

  it("hides the SIM ICCID from non-admins on /devices too", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);

    const adminOne = (await api.get(`/devices/${IDS.lotteInst}`, { token: tokens.admin })).json().device;
    assert.equal(adminOne.installation.iccid, IDS.lotteIccid);

    const one = (await api.get(`/devices/${IDS.lotteInst}`, { token: tokens.client })).json().device;
    assert.equal("iccid" in one.installation, false);

    const list = (await api.get("/devices", { token: tokens.client })).json().devices;
    assert.equal("iccid" in list[0].installation, false);
  });
});
