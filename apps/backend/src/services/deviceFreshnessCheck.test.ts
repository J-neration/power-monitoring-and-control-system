import assert from "node:assert/strict";
import { test } from "node:test";
import { COMM_LOST_AFTER_MS } from "../lib/commStatus.js";
import { findStaleDevices, freshnessConfigFrom } from "./deviceFreshnessCheck.js";

test("freshness check is off unless enabled", () => {
  assert.equal(freshnessConfigFrom({}).enabled, false);
  assert.equal(freshnessConfigFrom({ DEVICE_FRESHNESS_CHECK_ENABLED: "false" }).enabled, false);
  assert.equal(freshnessConfigFrom({ DEVICE_FRESHNESS_CHECK_ENABLED: "true" }).enabled, true);
});

test("defaults follow the on-screen comm-lost rule and a 7-day window", () => {
  const cfg = freshnessConfigFrom({});
  assert.equal(cfg.staleAfterMs, COMM_LOST_AFTER_MS);
  assert.equal(cfg.activeWindowMs, 7 * 86_400_000);
  assert.equal(freshnessConfigFrom({ DEVICE_STALE_AFTER_MINUTES: "90" }).staleAfterMs, 90 * 60_000);
  assert.equal(freshnessConfigFrom({ DEVICE_STALE_AFTER_MINUTES: "abc" }).staleAfterMs, COMM_LOST_AFTER_MS);
  assert.equal(freshnessConfigFrom({ DEVICE_FRESHNESS_ACTIVE_DAYS: "0" }).activeWindowMs, 7 * 86_400_000);
});

test("only devices past the threshold are stale", () => {
  const now = Date.parse("2026-10-26T00:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000);
  const report = findStaleDevices(
    [
      { installationId: "B", lastSeenAt: ago(31) },
      { installationId: "A", lastSeenAt: ago(30) },
      { installationId: "C", lastSeenAt: ago(9) },
      { installationId: "D", lastSeenAt: null },
    ],
    now,
    30 * 60_000,
  );
  assert.deepEqual(report, { active: 4, stale: 2, staleIds: ["A", "B"] });
});
