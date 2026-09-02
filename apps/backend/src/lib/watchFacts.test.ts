import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWatchFacts } from "./watchFacts.js";

describe("buildWatchFacts", () => {
  it("returns empty stats when there are no readings", () => {
    const facts = buildWatchFacts({
      installationId: "PSVG-DONGTAN01",
      hours: 24,
      lastSeenAt: null,
      readings: [],
    });
    assert.equal(facts.sampleCount, 0);
    assert.equal(facts.windowStart, null);
    assert.equal(facts.pf.tpfAfter.avg, null);
    assert.equal(facts.commLost, false);
  });

  it("computes min/max/avg over 24h readings", () => {
    const facts = buildWatchFacts({
      installationId: "PSVG-DONGTAN01",
      hours: 24,
      lastSeenAt: "2026-09-01T08:00:00Z",
      now: Date.parse("2026-09-01T08:10:00Z"),
      readings: [
        {
          recordedAt: "2026-09-01T00:00:00Z",
          tpf1: 76,
          tpf2: 98,
          loadCurrentTHDL1: 28,
          gridCurrentTHDL1: 1.8,
          vL1: 220,
          vL2: 221,
          vL3: 219,
          areaTemp: [32, 34],
          moduleTemp: [40, 42],
          totalCapacity: 200,
          operatingCapacity: 120,
          availableMargin: 80,
        },
        {
          recordedAt: "2026-09-01T08:00:00Z",
          tpf1: 80,
          tpf2: 99,
          loadCurrentTHDL1: 30,
          gridCurrentTHDL1: 2.0,
          vL1: 220,
          vL2: 220,
          vL3: 220,
          areaTemp: [36, 38],
          moduleTemp: [44, 48],
          totalCapacity: 200,
          operatingCapacity: 160,
          availableMargin: 40,
        },
      ],
    });

    assert.equal(facts.sampleCount, 2);
    assert.equal(facts.pf.tpfBefore.min, 76);
    assert.equal(facts.pf.tpfBefore.max, 80);
    assert.equal(facts.pf.tpfBefore.avg, 78);
    assert.equal(facts.pf.tpfAfter.avg, 98.5);
    assert.equal(facts.thd.loadMax, 30);
    assert.equal(facts.thd.gridMax, 2);
    assert.equal(facts.thermal.areaMax, 38);
    assert.equal(facts.thermal.moduleMax, 48);
    assert.equal(facts.capacity.total, 200);
    assert.equal(facts.capacity.marginMin, 40);
    assert.equal(facts.commLost, false);
    assert.equal(facts.windowStart, "2026-09-01T00:00:00.000Z");
    assert.equal(facts.windowEnd, "2026-09-01T08:00:00.000Z");
  });

  it("marks commLost from lastSeenAt, not from sample count", () => {
    const facts = buildWatchFacts({
      installationId: "PSVG-DONGTAN01",
      hours: 24,
      lastSeenAt: "2026-09-01T00:00:00Z",
      now: Date.parse("2026-09-01T01:00:00Z"),
      readings: [{ recordedAt: "2026-09-01T00:00:00Z", tpf2: 99 }],
    });
    assert.equal(facts.commLost, true);
  });
});
