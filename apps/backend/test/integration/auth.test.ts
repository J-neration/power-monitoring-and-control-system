import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { LOGIN_MAX_FAILURES } from "../../src/modules/auth/loginThrottle.js";
import { http, useTestApp } from "./helpers/app.js";
import { createSite, createUser, PASSWORD, tokenFor } from "./helpers/fixtures.js";

const t = useTestApp();

const INVALID_MESSAGE = "아이디 또는 비밀번호가 올바르지 않습니다.";

const login = (username: string, password: string) =>
  http(t.app).post("/auth/login", { username, password });

describe("POST /auth/login", () => {
  it("issues a token and returns the user without the password hash", async () => {
    await createUser({ username: "operator", role: "ADMIN" });

    const res = await login("operator", PASSWORD);

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(typeof body.token, "string");
    assert.equal(body.user.username, "operator");
    assert.equal(body.user.role, "ADMIN");
    assert.equal(body.user.passwordHash, undefined);
  });

  it("puts the role scope in the token so /auth/me can rebuild it", async () => {
    await createSite({ id: "gs-a", client: "gs" });
    await createUser({ username: "site-user", role: "SITE", siteId: "gs-a" });

    const { token } = (await login("site-user", PASSWORD)).json();
    const me = await http(t.app).get("/auth/me", { token });

    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json().user, {
      role: "SITE",
      userId: me.json().user.userId,
      username: "site-user",
      siteId: "gs-a",
    });
  });

  it("records lastLoginAt", async () => {
    const user = await createUser({ username: "operator", role: "ADMIN" });
    assert.equal(user.lastLoginAt, null);

    await login("operator", PASSWORD);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(after.lastLoginAt instanceof Date);
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    await createUser({ username: "operator", role: "ADMIN" });

    const wrongPassword = await login("operator", "Wrong#Password1");
    const unknownUser = await login("nobody", PASSWORD);

    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownUser.statusCode, 401);
    assert.equal(wrongPassword.json().message, INVALID_MESSAGE);
    assert.equal(unknownUser.json().message, INVALID_MESSAGE);
  });

  it("rejects a deactivated account with the same message", async () => {
    await createUser({ username: "retired", role: "ADMIN", isActive: false });

    const res = await login("retired", PASSWORD);

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().message, INVALID_MESSAGE);
  });

  it("returns 400 when username or password is missing", async () => {
    const res = await http(t.app).post("/auth/login", { username: "operator" });
    assert.equal(res.statusCode, 400);
  });

  it(`locks the account after ${LOGIN_MAX_FAILURES} failures, even for the right password`, async () => {
    await createUser({ username: "operator", role: "ADMIN" });

    const statuses: number[] = [];
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      statuses.push((await login("operator", "Wrong#Password1")).statusCode);
    }
    // 마지막 실패에서 잠기며 429 로 바뀐다.
    assert.deepEqual(statuses, [...Array(LOGIN_MAX_FAILURES - 1).fill(401), 429]);

    const locked = await login("operator", PASSWORD);
    assert.equal(locked.statusCode, 429);
    assert.ok(Number(locked.headers["retry-after"]) > 0);
  });

  it("counts failures per username regardless of case", async () => {
    await createUser({ username: "operator", role: "ADMIN" });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await login(i % 2 ? "OPERATOR" : "operator", "Wrong#Password1");
    }
    assert.equal((await login("operator", PASSWORD)).statusCode, 429);
  });

  it("clears the failure count after a successful login", async () => {
    await createUser({ username: "operator", role: "ADMIN" });
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
      await login("operator", "Wrong#Password1");
    }
    assert.equal((await login("operator", PASSWORD)).statusCode, 200);
    assert.equal((await login("operator", "Wrong#Password1")).statusCode, 401);
  });
});

describe("GET /auth/me", () => {
  it("returns 401 without a token", async () => {
    assert.equal((await http(t.app).get("/auth/me")).statusCode, 401);
  });

  it("returns 401 for a token signed with another secret", async () => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiJ4IiwidXNlcm5hbWUiOiJ4Iiwicm9sZSI6IkFETUlOIn0." +
      "c2lnbmVkLXdpdGgtYW5vdGhlci1zZWNyZXQ";
    assert.equal((await http(t.app).get("/auth/me", { token: forged })).statusCode, 401);
  });

  it("returns 401 for an expired token", async () => {
    const user = await createUser({ username: "operator", role: "ADMIN" });
    const expired = t.app.jwt.sign(
      { sub: user.id, username: user.username, role: "ADMIN", iat: Math.floor(Date.now() / 1000) - 7200 },
      { expiresIn: 60 },
    );
    assert.equal((await http(t.app).get("/auth/me", { token: expired })).statusCode, 401);
  });

  it("rejects a CLIENT token that lost its clientKey", async () => {
    const user = await createUser({ username: "broken", role: "CLIENT", clientKey: "lotte" });
    const token = tokenFor(t.app, { ...user, clientKey: null });
    assert.equal((await http(t.app).get("/auth/me", { token })).statusCode, 401);
  });
});
