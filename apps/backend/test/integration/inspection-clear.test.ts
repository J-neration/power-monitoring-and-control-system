import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { http, useTestApp } from "./helpers/app.js";
import { IDS, INSPECTION, createInstallation, seedInspection } from "./helpers/fixtures.js";

const t = useTestApp();

describe("DELETE /admin/sites/:siteId/installations (출고검사 일괄 삭제)", () => {
  it("clears every installation of the inspection site", async () => {
    const { tokens } = await seedInspection(t.app);
    await createInstallation({ id: "INSP-1", siteId: INSPECTION.site, label: "검사대 1", iccid: INSPECTION.iccid });
    await createInstallation({ id: "INSP-2", siteId: INSPECTION.site, label: "검사대 2" });

    const res = await http(t.app).delete(`/admin/sites/${INSPECTION.site}/installations`, { token: tokens.admin });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { deleted: 2 });
    assert.equal(await prisma.installation.count({ where: { siteId: INSPECTION.site } }), 0);
    assert.equal(await prisma.device.count({ where: { installationId: { in: ["INSP-1", "INSP-2"] } } }), 0);
    // 다른 현장은 그대로
    assert.equal(await prisma.installation.count({ where: { id: { in: [IDS.lotteInst, IDS.gsInst] } } }), 2);
  });

  it("refuses a customer site (409) and unknown site (404)", async () => {
    const { tokens } = await seedInspection(t.app);
    const customer = await http(t.app).delete(`/admin/sites/${IDS.lotteSite}/installations`, { token: tokens.admin });
    assert.equal(customer.statusCode, 409);
    assert.equal(await prisma.installation.count({ where: { siteId: IDS.lotteSite } }), 1);
    const unknown = await http(t.app).delete("/admin/sites/nope/installations", { token: tokens.admin });
    assert.equal(unknown.statusCode, 404);
  });

  it("is admin only", async () => {
    const { tokens, inspectorToken } = await seedInspection(t.app);
    for (const token of [tokens.client, tokens.viewer, inspectorToken]) {
      const res = await http(t.app).delete(`/admin/sites/${INSPECTION.site}/installations`, { token });
      assert.equal(res.statusCode, 403);
    }
  });

  it("marks the inspection site in the site list", async () => {
    const { tokens } = await seedInspection(t.app);
    const res = await http(t.app).get("/sites", { token: tokens.admin });
    const sites = (res.json() as { sites: Array<{ siteId: string; inspection: boolean }> }).sites;
    assert.equal(sites.find((s) => s.siteId === INSPECTION.site)?.inspection, true);
    assert.equal(sites.find((s) => s.siteId === IDS.lotteSite)?.inspection, false);
  });
});
