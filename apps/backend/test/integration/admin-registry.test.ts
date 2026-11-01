import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { http, useTestApp } from "./helpers/app.js";
import { seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

type ClientRow = { id: string; key: string; label: string; isActive: boolean };

const listClients = async (token: string, includeInactive = false) =>
  (await http(t.app).get(`/admin/registry/clients${includeInactive ? "?includeInactive=1" : ""}`, { token })).json()
    .clients as ClientRow[];

describe("construction company registry", () => {
  it("seeds the default companies from the database", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).get("/admin/registry/clients", { token: tokens.admin });
    assert.equal(res.json().source, "db");
    const keys = (res.json().clients as ClientRow[]).map((c) => c.key);
    for (const key of ["lotte", "gs", "hyundai", "posco"]) assert.ok(keys.includes(key), key);
  });

  it("creates a company with a lowercased key", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).post(
      "/admin/registry/clients",
      { key: "Daewoo", label: "대우건설" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().client.key, "daewoo");
  });

  it("rejects an invalid key and a duplicate key", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);
    const invalid = await api.post("/admin/registry/clients", { key: "1bad", label: "x" }, { token: tokens.admin });
    const dup = await api.post("/admin/registry/clients", { key: "lotte", label: "롯데" }, { token: tokens.admin });
    assert.equal(invalid.statusCode, 400);
    assert.equal(dup.statusCode, 409);
  });

  it("deactivated companies drop out of the default list", async () => {
    const { tokens } = await seedWorld(t.app);
    const created = (
      await http(t.app).post("/admin/registry/clients", { key: "sk", label: "SK에코플랜트" }, { token: tokens.admin })
    ).json().client as ClientRow;

    await http(t.app).patch(`/admin/registry/clients/${created.id}`, { isActive: false }, { token: tokens.admin });

    assert.ok(!(await listClients(tokens.admin)).some((c) => c.key === "sk"));
    assert.ok((await listClients(tokens.admin, true)).some((c) => c.key === "sk"));
  });

  it("refuses to delete a company that a site or account still uses", async () => {
    const { tokens } = await seedWorld(t.app);
    const lotte = (await listClients(tokens.admin)).find((c) => c.key === "lotte")!;
    const res = await http(t.app).delete(`/admin/registry/clients/${lotte.id}`, { token: tokens.admin });
    assert.equal(res.statusCode, 409);
  });

  it("deletes an unused company", async () => {
    const { tokens } = await seedWorld(t.app);
    const created = (
      await http(t.app).post("/admin/registry/clients", { key: "unused", label: "미사용" }, { token: tokens.admin })
    ).json().client as ClientRow;

    const res = await http(t.app).delete(`/admin/registry/clients/${created.id}`, { token: tokens.admin });

    assert.equal(res.statusCode, 204);
    assert.ok(!(await listClients(tokens.admin, true)).some((c) => c.key === "unused"));
  });

  it("returns 404 when updating or deleting an unknown company", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);
    assert.equal((await api.patch("/admin/registry/clients/missing", { label: "x" }, { token: tokens.admin })).statusCode, 404);
    assert.equal((await api.delete("/admin/registry/clients/missing", { token: tokens.admin })).statusCode, 404);
  });
});

describe("role registry", () => {
  it("lists the three roles", async () => {
    const { tokens } = await seedWorld(t.app);
    const roles = (await http(t.app).get("/admin/registry/roles", { token: tokens.admin })).json().roles;
    assert.deepEqual(roles.map((r: { key: string }) => r.key).sort(), ["ADMIN", "CLIENT", "SITE"]);
  });

  it("updates a role label", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      "/admin/registry/roles/SITE",
      { label: "현장 담당" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().role.label, "현장 담당");
  });

  it("rejects an unknown role key", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch("/admin/registry/roles/SUPERUSER", { label: "x" }, { token: tokens.admin });
    assert.equal(res.statusCode, 400);
  });
});
