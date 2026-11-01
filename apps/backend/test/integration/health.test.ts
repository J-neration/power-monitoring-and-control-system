import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { http, useTestApp } from "./helpers/app.js";

const t = useTestApp();

describe("GET /health", () => {
  it("responds without authentication", async () => {
    const res = await http(t.app).get("/health");
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "ok");
  });

  it("attaches the security headers to every response", async () => {
    const res = await http(t.app).get("/health");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["referrer-policy"], "no-referrer");
    assert.match(String(res.headers["strict-transport-security"]), /max-age=\d+/);
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});

describe("CORS", () => {
  it("allows the configured frontend origin with credentials", async () => {
    const res = await http(t.app).get("/health", { headers: { origin: "http://localhost:3000" } });
    assert.equal(res.headers["access-control-allow-origin"], "http://localhost:3000");
    assert.equal(res.headers["access-control-allow-credentials"], "true");
  });

  it("does not echo an unknown origin", async () => {
    const res = await http(t.app).get("/health", { headers: { origin: "https://evil.example.com" } });
    assert.notEqual(res.headers["access-control-allow-origin"], "https://evil.example.com");
  });
});

describe("unknown routes", () => {
  it("returns 404 instead of crashing", async () => {
    const res = await http(t.app).get("/definitely-not-a-route");
    assert.equal(res.statusCode, 404);
  });
});
