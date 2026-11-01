import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp();

const newSite = {
  id: "posco-new",
  name: "포스코 신규 현장",
  client: "posco",
  region: "부산",
  address: "부산시 해운대구 1",
};

describe("POST /admin/sites", () => {
  it("creates a site that then appears in /sites", async () => {
    const { tokens } = await seedWorld(t.app);

    const res = await http(t.app).post("/admin/sites", newSite, { token: tokens.admin });
    assert.equal(res.statusCode, 201);

    const sites = (await http(t.app).get("/sites", { token: tokens.admin })).json().sites;
    assert.ok(sites.some((s: { siteId: string }) => s.siteId === newSite.id));
  });

  it("only allows lowercase letters, digits and hyphens in the id", async () => {
    const { tokens } = await seedWorld(t.app);
    for (const id of ["Has-Upper", "has space", "under_score", ""]) {
      const res = await http(t.app).post("/admin/sites", { ...newSite, id }, { token: tokens.admin });
      assert.equal(res.statusCode, 400, `id=${JSON.stringify(id)}`);
    }
  });

  it("returns 409 for a duplicate id", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).post("/admin/sites", { ...newSite, id: IDS.lotteSite }, { token: tokens.admin });
    assert.equal(res.statusCode, 409);
  });
});

describe("PATCH /admin/sites/:siteId", () => {
  it("updates the site details", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      `/admin/sites/${IDS.lotteSite}`,
      { name: "이름 변경", client: "lotte", region: "인천", address: "인천시 1" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().site.name, "이름 변경");
  });

  it("moving a site to another company changes who can see it", async () => {
    const { tokens } = await seedWorld(t.app);
    await http(t.app).patch(
      `/admin/sites/${IDS.lotteSite}`,
      { name: "이관 현장", client: "gs", region: "서울", address: "서울시 1" },
      { token: tokens.admin },
    );
    const res = await http(t.app).get(`/sites/${IDS.lotteSite}`, { token: tokens.client });
    assert.equal(res.statusCode, 404);
  });

  it("returns 404 for an unknown site", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      "/admin/sites/missing",
      { name: "x", client: "x", region: "x", address: "x" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 404);
  });
});

describe("DELETE /admin/sites/:siteId", () => {
  it("cascades to installations, devices and telemetry", async () => {
    const { tokens } = await seedWorld(t.app);
    await hmi(t.app).post("/receiver", telemetryPayload());
    assert.ok((await prisma.telemetryRecord.count({ where: { installationId: IDS.lotteInst } })) > 0);

    const res = await http(t.app).delete(`/admin/sites/${IDS.lotteSite}`, { token: tokens.admin });

    assert.equal(res.statusCode, 204);
    assert.equal(await prisma.installation.count({ where: { siteId: IDS.lotteSite } }), 0);
    assert.equal(await prisma.device.count({ where: { installationId: IDS.lotteInst } }), 0);
    assert.equal(await prisma.telemetryRecord.count({ where: { installationId: IDS.lotteInst } }), 0);
  });

  it("returns 404 for an unknown site", async () => {
    const { tokens } = await seedWorld(t.app);
    assert.equal((await http(t.app).delete("/admin/sites/missing", { token: tokens.admin })).statusCode, 404);
  });
});

describe("installations", () => {
  it("creating an installation also creates an empty device row", async () => {
    const { tokens } = await seedWorld(t.app);

    const res = await http(t.app).post(
      `/admin/sites/${IDS.gsSite}/installations`,
      { id: "TEST-GS-02", label: "101동" },
      { token: tokens.admin },
    );

    assert.equal(res.statusCode, 201);
    const device = await prisma.device.findUniqueOrThrow({ where: { installationId: "TEST-GS-02" } });
    assert.equal(device.lastSeenAt, null);
  });

  it("returns 409 for a duplicate installation id and 404 for a missing site", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);
    const dup = await api.post(
      `/admin/sites/${IDS.gsSite}/installations`,
      { id: IDS.lotteInst, label: "중복" },
      { token: tokens.admin },
    );
    const noSite = await api.post(
      "/admin/sites/missing/installations",
      { id: "TEST-NEW-01", label: "없음" },
      { token: tokens.admin },
    );
    assert.equal(dup.statusCode, 409);
    assert.equal(noSite.statusCode, 404);
  });

  it("deletes an installation", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).delete(`/admin/installations/${IDS.gsInst}`, { token: tokens.admin });
    assert.equal(res.statusCode, 204);
    assert.equal(await prisma.installation.count({ where: { id: IDS.gsInst } }), 0);
    assert.equal(
      (await http(t.app).delete(`/admin/installations/${IDS.gsInst}`, { token: tokens.admin })).statusCode,
      404,
    );
  });
});

describe("PATCH /admin/installations/:id/iccid", () => {
  it("normalizes spaces and hyphens before saving", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      `/admin/installations/${IDS.gsInst}/iccid`,
      { iccid: "8982 0000-0000 0000 0033" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 200);
    const row = await prisma.installation.findUniqueOrThrow({ where: { id: IDS.gsInst } });
    assert.equal(row.iccid, "89820000000000000033");
  });

  it("refuses an ICCID already registered elsewhere, including its 19-digit form", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);

    const same = await api.patch(
      `/admin/installations/${IDS.gsInst}/iccid`,
      { iccid: IDS.lotteIccid },
      { token: tokens.admin },
    );
    const nineteen = await api.patch(
      `/admin/installations/${IDS.gsInst}/iccid`,
      { iccid: IDS.lotteIccid.slice(0, 19) },
      { token: tokens.admin },
    );

    assert.equal(same.statusCode, 409);
    assert.equal(nineteen.statusCode, 409);
  });

  it("clears the mapping with null", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      `/admin/installations/${IDS.lotteInst}/iccid`,
      { iccid: null },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 200);
    const row = await prisma.installation.findUniqueOrThrow({ where: { id: IDS.lotteInst } });
    assert.equal(row.iccid, null);
  });

  it("returns 404 for an unknown installation", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      "/admin/installations/missing/iccid",
      { iccid: "89820000000000000041" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 404);
  });
});
