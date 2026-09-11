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
    assert.equal(facts.pf.tpfAfter.minMagSigned, 98);
    assert.equal(facts.thd.loadMax, 30);
    assert.equal(facts.thd.gridMax, 2);
    assert.equal(facts.thermal.areaMax, 38);
    assert.equal(facts.thermal.areaMaxAt, "2026-09-01T08:00:00.000Z");
    assert.equal(facts.pf.tpfBefore.minAt, "2026-09-01T00:00:00.000Z");
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

  it("keeps light-load samples out of the THD/PF judgement set", () => {
    const facts = buildWatchFacts({
      installationId: "PSVG-DONGTAN01",
      hours: 24,
      lastSeenAt: "2026-09-01T08:00:00Z",
      now: Date.parse("2026-09-01T08:10:00Z"),
      readings: [
        {
          recordedAt: "2026-09-01T04:00:00Z",
          gridCurrentL1: 2,
          gridCurrentTHDL1: 48,
          tpf2: 40,
        },
        {
          recordedAt: "2026-09-01T08:00:00Z",
          gridCurrentL1: 100,
          gridCurrentTHDL1: 2,
          tpf2: 98,
        },
      ],
    });

    assert.equal(facts.sampleCount, 2);
    assert.equal(facts.load.maxCurrent, 100);
    assert.equal(facts.load.judgedSampleCount, 1);
    assert.equal(facts.load.skippedSampleCount, 1);
    assert.equal(facts.thd.gridMax, 2);
    assert.equal(facts.pf.tpfAfter.minMagSigned, 98);
  });

  it("summarises compensation, modules and fans", () => {
    const facts = buildWatchFacts({
      installationId: "PSVG-DONGTAN01",
      hours: 24,
      lastSeenAt: "2026-09-01T08:00:00Z",
      now: Date.parse("2026-09-01T08:10:00Z"),
      readings: [
        {
          recordedAt: "2026-09-01T08:00:00Z",
          moduleStatus: [2, 2, 3, 4, 2, 2],
          numOfMods: 6,
          tpf1: 76,
          tpf2: 98,
          loadCurrentTHDL1: 30,
          gridCurrentTHDL1: 3,
          moduleTemp: [40, 41, 40, 39, 52, 40],
          fanSpeed: [8.2, 0],
          totalCapacity: 200,
          operatingCapacity: 196,
        },
      ],
    });

    assert.equal(facts.compensation.thdBefore, 30);
    assert.equal(facts.compensation.thdAfter, 3);
    assert.equal(facts.compensation.thdReduction, 0.9);
    assert.equal(facts.compensation.tpfGain, 22);
    assert.deepEqual(facts.modules, {
      total: 6,
      running: 4,
      fault: 1,
      offline: 1,
      at: "2026-09-01T08:00:00.000Z",
    });
    assert.equal(facts.fan.stopped, 1);
    assert.equal(facts.fan.whileRunning, true);
    // 고장·정지 모듈은 식어 있으므로 운전 중인 4대만 비교한다
    assert.equal(facts.thermal.moduleSpreadMax, 12);
    assert.equal(facts.capacity.operatingRatioMax, 0.98);
    assert.equal(facts.capacity.saturatedSampleCount, 1);
  });
});
