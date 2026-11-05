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

function hourly(
  start: string,
  count: number,
  sample: (index: number) => Record<string, number | null>,
) {
  const t0 = new Date(start).getTime();
  return Array.from({ length: count }, (_, index) => ({
    recordedAt: new Date(t0 + index * 3_600_000).toISOString(),
    ...sample(index),
  }));
}

describe("computeOpsSavings", () => {
  it("does not annualise a live snapshot", () => {
    const s = computeOpsSavings({
      uncompP: 7.3,
      compP: 74.2,
      tpf1: -13.7,
      tpf2: -93.2,
      vL1: 380,
      vL2: 380,
      vL3: 380,
    });
    assert.equal(s.basis, "gathering");
    assert.ok(s.kwSaved != null && s.kwSaved > 1.5);
    assert.equal(s.kWhYear, null);
    assert.equal(s.carbonKgYear, null);
    assert.equal(s.costYear, null);
  });

  it("does not annualise a few hours of history", () => {
    const s = computeOpsSavings(
      { uncompP: 50, tpf1: 70, tpf2: 95 },
      hourly("2026-09-10T00:00:00Z", 5, () => ({ uncompP: 50, tpf1: 70, tpf2: 95 })),
    );
    assert.equal(s.basis, "gathering");
    assert.equal(s.kWhYear, null);
    assert.ok(s.windowHours != null && s.windowHours < 24 * 7);
  });

  it("keeps the annual figure when the live load is idle", () => {
    const s = computeOpsSavings(
      { uncompP: -0.2, compP: -0.2, tpf1: 9.9, tpf2: 8.2 },
      hourly("2026-09-01T00:00:00Z", 24 * 10, () => ({
        uncompP: 50,
        tpf1: 70,
        tpf2: 95,
      })),
    );
    assert.equal(s.kwSaved, null);
    assert.equal(s.basis, "partial");
    assert.ok(s.kWhYear != null && s.kWhYear > 0);
    assert.ok(s.costYear != null && s.costYear > 0);
  });

  it("does not follow today's power when the month is already measured", () => {
    const history = hourly("2026-09-01T00:00:00Z", 24 * 10, () => ({
      uncompP: 50,
      tpf1: 70,
      tpf2: 95,
    }));
    const quiet = computeOpsSavings({ uncompP: 5, tpf1: 70, tpf2: 95 }, history);
    const busy = computeOpsSavings({ uncompP: 400, tpf1: 70, tpf2: 95 }, history);
    assert.equal(quiet.kWhYear, busy.kWhYear);
    assert.equal(quiet.costYear, busy.costYear);
    assert.ok(quiet.kwSaved != null && busy.kwSaved != null);
    assert.ok(busy.kwSaved > quiet.kwSaved * 10);
  });

  it("counts idle hours as zero savings instead of copying the loaded hour across the year", () => {
    const loaded = hourly("2026-09-01T00:00:00Z", 24 * 10, () => ({
      uncompP: 50,
      tpf1: 70,
      tpf2: 95,
    }));
    const half = hourly("2026-09-01T00:00:00Z", 24 * 10, (index) => ({
      uncompP: index % 2 === 0 ? 50 : 0,
      tpf1: 70,
      tpf2: 95,
    }));
    const fullYear = computeOpsSavings({ uncompP: 50, tpf1: 70, tpf2: 95 }, loaded);
    const withNights = computeOpsSavings({ uncompP: 50, tpf1: 70, tpf2: 95 }, half);
    assert.ok(fullYear.kWhYear != null && withNights.kWhYear != null);
    assert.ok(withNights.kWhYear < fullYear.kWhYear * 0.6);
  });

  it("prices harmonic copper loss apart from the power-factor charge", () => {
    const s = computeOpsSavings(
      { uncompP: 10, dpf1: 90, dpf2: 90, tpf1: 70, tpf2: 95 },
      hourly("2026-09-01T00:00:00Z", 24 * 10, () => ({
        uncompP: 80,
        dpf1: 90,
        dpf2: 90,
        tpf1: 70,
        tpf2: 95,
        loadCurrentTHDL1: 40,
        gridCurrentTHDL1: 4,
        vL1: 380,
        vL2: 380,
        vL3: 380,
      })),
    );
    assert.equal(s.pfBillBasis, "dpf");
    assert.equal(s.pfCostYear, null);
    assert.equal(s.pfEnergyCostYear, 0);
    assert.ok(s.thdEnergyCostYear != null && s.thdEnergyCostYear > 0);
    assert.equal(s.energyCostYear, s.thdEnergyCostYear);
    assert.equal(s.costYear, s.thdEnergyCostYear);
  });

  it("uses the window peak, not the live kilowatts, for the power-factor charge", () => {
    const s = computeOpsSavings(
      { uncompP: 10, dpf1: 80, dpf2: 96 },
      hourly("2026-09-01T00:00:00Z", 24 * 10, (index) => ({
        uncompP: 40,
        uncompPMax: index === 3 ? 180 : 40,
        dpf1: 80,
        dpf2: 96,
        tpf1: 80,
        tpf2: 96,
      })),
    );
    assert.equal(s.demandKw, 180);
    const monthly = 180 * 8320;
    const expected = monthly * (0.02 - -0.01) * 12;
    assert.ok(s.pfCostYear != null);
    assert.ok(Math.abs(s.pfCostYear - expected) < 1, `${s.pfCostYear} vs ${expected}`);
  });
});
