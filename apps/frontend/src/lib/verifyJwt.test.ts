import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyHs256Jwt } from "./verifyJwt";

/**
 * middleware 가 쿠키의 JWT 를 이 함수로 거른다. 여기서 통과하면 보호된 화면이 렌더링되므로
 * 위조·만료 토큰은 반드시 false 여야 한다. 토큰은 백엔드(@fastify/jwt)와 같은 HS256 으로 만든다.
 */
const SECRET = "integration-test-jwt-secret-0123456789";
const NOW = 1_800_000_000;

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

const sign = (
  claims: Record<string, unknown>,
  { secret = SECRET, header = { alg: "HS256", typ: "JWT" } }: { secret?: string; header?: object } = {},
) => {
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};

describe("verifyHs256Jwt", () => {
  it("accepts a valid, unexpired token", async () => {
    assert.equal(await verifyHs256Jwt(sign({ sub: "u1", exp: NOW + 60 }), SECRET, NOW), true);
  });

  it("accepts a token without exp", async () => {
    assert.equal(await verifyHs256Jwt(sign({ sub: "u1" }), SECRET, NOW), true);
  });

  it("rejects a token signed with another secret", async () => {
    const token = sign({ sub: "u1", exp: NOW + 60 }, { secret: "someone-elses-secret" });
    assert.equal(await verifyHs256Jwt(token, SECRET, NOW), false);
  });

  it("rejects an expired token, including one expiring exactly now", async () => {
    assert.equal(await verifyHs256Jwt(sign({ exp: NOW - 1 }), SECRET, NOW), false);
    assert.equal(await verifyHs256Jwt(sign({ exp: NOW }), SECRET, NOW), false);
  });

  it("rejects a token that is not valid yet", async () => {
    assert.equal(await verifyHs256Jwt(sign({ nbf: NOW + 60 }), SECRET, NOW), false);
  });

  it("rejects a tampered payload", async () => {
    const [head, , sig] = sign({ role: "SITE", exp: NOW + 60 }).split(".");
    const forged = `${head}.${b64url(JSON.stringify({ role: "ADMIN", exp: NOW + 60 }))}.${sig}`;
    assert.equal(await verifyHs256Jwt(forged, SECRET, NOW), false);
  });

  it("rejects alg=none and other algorithms", async () => {
    const head = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "u1" }));
    assert.equal(await verifyHs256Jwt(`${head}.${body}.`, SECRET, NOW), false);
    assert.equal(await verifyHs256Jwt(sign({ sub: "u1" }, { header: { alg: "HS512" } }), SECRET, NOW), false);
  });

  it("rejects garbage without throwing", async () => {
    for (const token of ["", "abc", "a.b", "a.b.c.d", "!!!.###.$$$"]) {
      assert.equal(await verifyHs256Jwt(token, SECRET, NOW), false, JSON.stringify(token));
    }
  });
});
