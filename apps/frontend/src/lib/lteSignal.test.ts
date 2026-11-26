import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLteSignalInfo, isLteOffline } from "./lteSignal";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("isLteOffline", () => {
  it("treats a device heard from just now as online, whatever its modules report", () => {
    assert.equal(isLteOffline(minutesAgo(0), NOW), false);
    assert.equal(isLteOffline(minutesAgo(29), NOW), false);
  });

  it("is offline when never heard from or silent for 30 minutes", () => {
    assert.equal(isLteOffline(null, NOW), true);
    assert.equal(isLteOffline(minutesAgo(30), NOW), true);
  });
});

describe("getLteSignalInfo", () => {
  it("says 측정 안 됨, not 수신 없음, when data arrived without a signal reading", () => {
    assert.equal(getLteSignalInfo(null, 99).grade, "unmeasured");
    assert.equal(getLteSignalInfo(null, 99).label, "측정 안 됨");
    assert.equal(getLteSignalInfo(undefined, undefined).grade, "unmeasured");
  });

  it("says 수신 없음 only when communication is down", () => {
    const info = getLteSignalInfo(-80, 23, true);
    assert.equal(info.grade, "none");
    assert.equal(info.label, "수신 없음");
  });

  it("still grades a real reading", () => {
    assert.equal(getLteSignalInfo(-80, null).grade, "excellent");
    assert.equal(getLteSignalInfo(null, 12).grade, "poor");
  });
});
