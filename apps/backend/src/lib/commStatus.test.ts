import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMM_LOST_AFTER_MS, isCommLost } from "./commStatus.js";

describe("isCommLost", () => {
  const now = Date.parse("2026-08-21T00:30:00Z");

  it("is false when lastSeenAt is null (never received)", () => {
    assert.equal(isCommLost(null, now), false);
    assert.equal(isCommLost(undefined, now), false);
  });

  it("is false within the 30-minute window", () => {
    assert.equal(isCommLost(new Date(now - 10 * 60 * 1000), now), false);
    assert.equal(isCommLost(new Date(now - COMM_LOST_AFTER_MS + 1), now), false);
  });

  it("is true after 30 minutes without telemetry", () => {
    assert.equal(isCommLost(new Date(now - COMM_LOST_AFTER_MS), now), true);
    assert.equal(isCommLost(new Date(now - 15 * 60 * 60 * 1000).toISOString(), now), true);
  });
});
