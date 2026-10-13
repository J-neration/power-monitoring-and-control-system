import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EnvConfigError, parseEnv } from "./server.js";

const deployedSecrets = {
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/pmcs",
  JWT_SECRET: "a-real-secret-that-is-long-enough",
  RECEIVER_API_KEY: "real-receiver-key",
  FRONTEND_ORIGIN: "https://app.example.com",
};

describe("parseEnv", () => {
  it("keeps proxy trust, WS ping and WS auth off when unset", () => {
    const env = parseEnv({ NODE_ENV: "production", ...deployedSecrets });
    assert.equal(env.TRUST_PROXY_HOPS, 0);
    assert.equal(env.WS_PING_INTERVAL_MS, 0);
    assert.equal(env.WS_REQUIRE_AUTH, false);
  });

  it("reads the AWS-only options when set", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      ...deployedSecrets,
      TRUST_PROXY_HOPS: "1",
      WS_PING_INTERVAL_MS: "30000",
      WS_REQUIRE_AUTH: "true",
    });
    assert.equal(env.TRUST_PROXY_HOPS, 1);
    assert.equal(env.WS_PING_INTERVAL_MS, 30000);
    assert.equal(env.WS_REQUIRE_AUTH, true);
  });

  it("treats an ECS task as deployed even without NODE_ENV", () => {
    assert.throws(
      () =>
        parseEnv({
          ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/abc",
          ...deployedSecrets,
          JWT_SECRET: "",
        }),
      EnvConfigError,
    );
  });

  it("falls back to local defaults outside a deployment", () => {
    const env = parseEnv({});
    assert.equal(env.FRONTEND_ORIGIN.at(0), "http://localhost:3000");
  });
});
