import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { http, useTestApp } from "./helpers/app.js";
import { createUser, IDS, PASSWORD, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

describe("GET /admin/users", () => {
  it("lists accounts without password hashes", async () => {
    const { tokens } = await seedWorld(t.app);

    const res = await http(t.app).get("/admin/users", { token: tokens.admin });

    assert.equal(res.statusCode, 200);
    const users = res.json().users;
    assert.equal(users.length, 4); // admin, client, site, viewer
    for (const user of users) assert.equal(user.passwordHash, undefined);
  });
});

describe("POST /admin/users", () => {
  it("creates an account that can log in", async () => {
    const { tokens } = await seedWorld(t.app);

    const created = await http(t.app).post(
      "/admin/users",
      { username: "new-site", role: "SITE", siteId: IDS.gsSite, initialPassword: "Fresh#Start9" },
      { token: tokens.admin },
    );
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.passwordHash, undefined);

    const login = await http(t.app).post("/auth/login", { username: "new-site", password: "Fresh#Start9" });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.siteId, IDS.gsSite);
  });

  it("creates a sales VIEWER account that logs in and sees every site", async () => {
    const { tokens } = await seedWorld(t.app);

    const created = await http(t.app).post(
      "/admin/users",
      { username: "prime-sales", role: "VIEWER", initialPassword: "Fresh#Start9" },
      { token: tokens.admin },
    );
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.role, "VIEWER");

    const login = await http(t.app).post("/auth/login", { username: "prime-sales", password: "Fresh#Start9" });
    assert.equal(login.statusCode, 200);
    const sites = (await http(t.app).get("/sites", { token: login.json().token })).json().sites;
    assert.equal(sites.length, 2);
  });

  it("stores a bcrypt hash, never the plain password", async () => {
    const { tokens } = await seedWorld(t.app);
    await http(t.app).post(
      "/admin/users",
      { username: "new-admin", role: "ADMIN", initialPassword: "Fresh#Start9" },
      { token: tokens.admin },
    );
    const row = await prisma.user.findUniqueOrThrow({ where: { username: "new-admin" } });
    assert.notEqual(row.passwordHash, "Fresh#Start9");
    assert.match(row.passwordHash, /^\$2[aby]\$/);
  });

  for (const [why, password, username] of [
    ["too short", "Ab#1", "short-pw"],
    ["contains whitespace", "has space 123", "space-pw"],
    ["too common", "password123", "common-pw"],
    ["same as the username", "samename99", "samename99"],
  ] as const) {
    it(`rejects a password that is ${why}`, async () => {
      const { tokens } = await seedWorld(t.app);
      const res = await http(t.app).post(
        "/admin/users",
        { username, role: "ADMIN", initialPassword: password },
        { token: tokens.admin },
      );
      assert.equal(res.statusCode, 400);
      assert.equal(await prisma.user.count({ where: { username } }), 0);
    });
  }

  it("requires an active construction company for CLIENT accounts", async () => {
    const { tokens } = await seedWorld(t.app);
    const api = http(t.app);

    const missing = await api.post(
      "/admin/users",
      { username: "c1", role: "CLIENT", initialPassword: PASSWORD },
      { token: tokens.admin },
    );
    const unknown = await api.post(
      "/admin/users",
      { username: "c2", role: "CLIENT", clientKey: "no-such-company", initialPassword: PASSWORD },
      { token: tokens.admin },
    );
    const valid = await api.post(
      "/admin/users",
      { username: "c3", role: "CLIENT", clientKey: "gs", initialPassword: PASSWORD },
      { token: tokens.admin },
    );

    assert.equal(missing.statusCode, 400);
    assert.equal(unknown.statusCode, 400);
    assert.equal(valid.statusCode, 201);
  });

  it("rejects a role that is not assignable", async () => {
    const { tokens } = await seedWorld(t.app);
    await http(t.app).patch("/admin/registry/roles/SITE", { isAssignable: false }, { token: tokens.admin });

    const res = await http(t.app).post(
      "/admin/users",
      { username: "s1", role: "SITE", siteId: IDS.gsSite, initialPassword: PASSWORD },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 400);
  });
});

describe("PATCH /admin/users/:id", () => {
  it("deactivating an account blocks its next login", async () => {
    const { tokens, users } = await seedWorld(t.app);

    const res = await http(t.app).patch(
      `/admin/users/${users.client.id}`,
      { isActive: false },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 200);

    const login = await http(t.app).post("/auth/login", { username: users.client.username, password: PASSWORD });
    assert.equal(login.statusCode, 401);
  });

  it("resets the password", async () => {
    const { tokens, users } = await seedWorld(t.app);
    await http(t.app).patch(
      `/admin/users/${users.site.id}`,
      { newPassword: "Reset#Pass77" },
      { token: tokens.admin },
    );

    const api = http(t.app);
    assert.equal((await api.post("/auth/login", { username: users.site.username, password: PASSWORD })).statusCode, 401);
    assert.equal((await api.post("/auth/login", { username: users.site.username, password: "Reset#Pass77" })).statusCode, 200);
  });

  it("rejects a weak new password", async () => {
    const { tokens, users } = await seedWorld(t.app);
    const res = await http(t.app).patch(
      `/admin/users/${users.site.id}`,
      { newPassword: "short" },
      { token: tokens.admin },
    );
    assert.equal(res.statusCode, 400);
  });

  it("returns 404 for an unknown user", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).patch("/admin/users/missing", { isActive: false }, { token: tokens.admin });
    assert.equal(res.statusCode, 404);
  });
});

describe("DELETE /admin/users/:id", () => {
  it("removes the account", async () => {
    const { tokens } = await seedWorld(t.app);
    const victim = await createUser({ username: "to-delete", role: "ADMIN" });

    const res = await http(t.app).delete(`/admin/users/${victim.id}`, { token: tokens.admin });

    assert.equal(res.statusCode, 204);
    assert.equal(await prisma.user.count({ where: { id: victim.id } }), 0);
  });

  it("returns 404 for an unknown user", async () => {
    const { tokens } = await seedWorld(t.app);
    const res = await http(t.app).delete("/admin/users/missing", { token: tokens.admin });
    assert.equal(res.statusCode, 404);
  });
});
