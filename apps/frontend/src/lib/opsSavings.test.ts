import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOpsSavings, estimateKwSaved } from "./opsSavings";

/**
 * 절감은 보상 전후 역률만으로 낸다. 전류는 역률에 반비례하고 동손은 전류
 * 제곱에 비례하므로 절감률 = 1 − (PF_전 / PF_후)².
 */
describe("estimateKwSaved", () => {
  it("derives the saving from power factor alone", () => {
    // 보상 전 S = 7.3 / 0.137 = 53.3 kVA, 동손 = 53.3 × 3% = 1.60 kW
    // 절감률 = 1 − (13.7/93.2)² = 97.8%  →  1.56 kW
    const kw = estimateKwSaved({ uncompP: 7.3, tpf1: -13.7, tpf2: -93.2 });
    assert.ok(kw != null, "expected a saving");
    assert.ok(Math.abs(kw - 1.564) < 0.01, `got ${kw}`);
  });

  it("ignores compP, current and kVA entirely", () => {
    const bare = estimateKwSaved({ uncompP: 7.3, tpf1: -13.7, tpf2: -93.2 });
    const noisy = estimateKwSaved({
      uncompP: 7.3,
      tpf1: -13.7,
      tpf2: -93.2,
      // 배율이 10배 어긋난 compP, 오히려 늘어난 전류·kVA — 결과에 영향 없어야 한다
      compP: 74.2,
      uncompS: 53.3,
      compS: 79.6,
      loadCurrentL1: 81,
      gridCurrentL1: 121,
    });
    assert.equal(bare, noisy);
  });

  it("treats leading power factor by magnitude", () => {
    const lead = estimateKwSaved({ uncompP: 50, tpf1: -70, tpf2: -95 });
    const lag = estimateKwSaved({ uncompP: 50, tpf1: 70, tpf2: 95 });
    assert.ok(lead != null && lag != null);
    assert.equal(lead, lag);
  });

  it("scales with load size", () => {
    const small = estimateKwSaved({ uncompP: 7.3, tpf1: 13.7, tpf2: 93.2 });
    const big = estimateKwSaved({ uncompP: 73, tpf1: 13.7, tpf2: 93.2 });
    assert.ok(small != null && big != null);
    assert.ok(Math.abs(big - small * 10) < 0.01, `${big} vs ${small}`);
  });

  it("returns null when the power factor did not improve", () => {
    assert.equal(estimateKwSaved({ uncompP: 50, tpf1: 95, tpf2: 95 }), null);
    assert.equal(estimateKwSaved({ uncompP: 50, tpf1: 95, tpf2: 88 }), null);
  });

  it("returns null below the idle load floor", () => {
    assert.equal(estimateKwSaved({ uncompP: 0.4, tpf1: 13.7, tpf2: 93.2 }), null);
    assert.equal(estimateKwSaved({ uncompP: -0.2, tpf1: 13.7, tpf2: 93.2 }), null);
  });

  it("returns null when no power factor is reported", () => {
    assert.equal(
      estimateKwSaved({
        uncompP: 50,
        compP: 48,
        loadCurrentL1: 80,
        gridCurrentL1: 40,
      }),
      null,
    );
  });

  it("falls back to DPF and THD when TPF is missing", () => {
    // TPF = DPF / √(1 + THD²)
    const viaDpf = estimateKwSaved({
      uncompP: 7.3,
      dpf1: 13.75,
      loadCurrentTHDL1: 4,
      dpf2: 96.8,
      gridCurrentTHDL1: 28,
    });
    const viaTpf = estimateKwSaved({ uncompP: 7.3, tpf1: -13.7, tpf2: -93.2 });
    assert.ok(viaDpf != null && viaTpf != null);
    assert.ok(
      Math.abs(viaDpf - viaTpf) / viaTpf < 0.02,
      `fallback drifted: ${viaDpf} vs ${viaTpf}`,
    );
  });

  it("does not double count THD when TPF is present", () => {
    const lowThd = estimateKwSaved({
      uncompP: 50,
      tpf1: 70,
      tpf2: 95,
      gridCurrentTHDL1: 3,
    });
    const highThd = estimateKwSaved({
      uncompP: 50,
      tpf1: 70,
      tpf2: 95,
      gridCurrentTHDL1: 40,
    });
    assert.equal(lowThd, highThd);
  });
});

describe("computeOpsSavings", () => {
  it("fills energy, carbon and cost from the power factor pair", () => {
    const s = computeOpsSavings({
      uncompP: 7.3,
      compP: 74.2, // 배율 어긋난 값이어도 무시된다
      tpf1: -13.7,
      tpf2: -93.2,
      loadCurrentTHDL1: 4,
      gridCurrentTHDL1: 28,
      vL1: 380,
      vL2: 380,
      vL3: 380,
    });
    assert.ok(s.kwSaved != null && s.kwSaved > 1.5);
    assert.ok(s.kWhYear != null && s.kWhYear > 13_000);
    assert.ok(s.carbonKgYear != null && s.carbonKgYear > 5_000);
    assert.ok(s.treesYear != null && s.treesYear > 800);
    assert.ok(s.energyCostYear != null && s.energyCostYear > 2_000_000);
    assert.ok(s.costYear != null && s.costYear > 2_000_000);
  });

  it("does not use 24h history when live P is idle", () => {
    const s = computeOpsSavings({ uncompP: -0.2, compP: -0.2, tpf1: 9.9, tpf2: 8.2 }, [
      {
        recordedAt: "2026-09-10T00:00:00Z",
        uncompP: 50,
        tpf1: 70,
        tpf2: 95,
      },
      {
        recordedAt: "2026-09-10T08:00:00Z",
        uncompP: 52,
        tpf1: 70,
        tpf2: 95,
      },
    ]);
    assert.equal(s.kwSaved, null);
    assert.equal(s.kWhYear, null);
    assert.equal(s.energyCostYear, null);
    assert.equal(s.costYear, null);
  });

  it("annualises from history when it is available", () => {
    const s = computeOpsSavings(
      { uncompP: 50, tpf1: 70, tpf2: 95 },
      [
        {
          recordedAt: "2026-09-10T00:00:00Z",
          uncompP: 50,
          tpf1: 70,
          tpf2: 95,
        },
        {
          recordedAt: "2026-09-10T04:00:00Z",
          uncompP: 50,
          tpf1: 70,
          tpf2: 95,
        },
      ],
    );
    assert.equal(s.windowHours, 4);
    assert.ok(s.kWhWindow != null && s.kWhWindow > 0);
    assert.ok(s.kWhYear != null && s.kWhYear > 0);
  });
});
