import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractWatchAnomalies } from "./watchAnomalies.js";
import { buildWatchFacts, type WatchFacts } from "./watchFacts.js";

function factsFrom(readings: Parameters<typeof buildWatchFacts>[0]["readings"]): WatchFacts {
  return buildWatchFacts({
    installationId: "PSVG-DONGTAN01",
    hours: 24,
    lastSeenAt: "2026-09-01T08:00:00Z",
    now: Date.parse("2026-09-01T08:05:00Z"),
    readings,
  });
}

const healthy = {
  recordedAt: "2026-09-01T08:00:00Z",
  tpf2: 98,
  dpf2: 99,
  gridCurrentTHDL1: 1.8,
  vL1: 220,
  vL2: 221,
  vL3: 219.5,
  areaTemp: [32, 33],
  moduleTemp: [38, 39],
};

describe("extractWatchAnomalies", () => {
  it("returns none for healthy compensated readings", () => {
    const anomalies = extractWatchAnomalies(factsFrom([healthy]));
    assert.deepEqual(anomalies, []);
  });

  it("flags low compensated TPF as warn then danger", () => {
    const warn = extractWatchAnomalies(factsFrom([{ ...healthy, tpf2: 87 }]));
    assert.equal(warn[0]?.code, "tpf_after_low");
    assert.equal(warn[0]?.level, "warn");

    const danger = extractWatchAnomalies(factsFrom([{ ...healthy, tpf2: 80 }]));
    assert.equal(danger[0]?.code, "tpf_after_low");
    assert.equal(danger[0]?.level, "danger");
  });

  it("flags grid THD at 20% and ignores high load THD", () => {
    const loadOnly = extractWatchAnomalies(
      factsFrom([{ ...healthy, loadCurrentTHDL1: 28, gridCurrentTHDL1: 1.8 }]),
    );
    assert.equal(loadOnly.some((a) => a.code === "thd_grid_high"), false);

    const grid = extractWatchAnomalies(
      factsFrom([{ ...healthy, gridCurrentTHDL1: 21 }]),
    );
    assert.equal(grid[0]?.code, "thd_grid_high");
    assert.equal(grid[0]?.level, "danger");
  });

  it("flags ambient and module temperature bands", () => {
    const area = extractWatchAnomalies(
      factsFrom([{ ...healthy, areaTemp: [36] }]),
    );
    assert.equal(area[0]?.code, "area_temp_high");
    assert.equal(area[0]?.level, "warn");

    const module = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleTemp: [91] }]),
    );
    assert.equal(module[0]?.code, "module_temp_high");
    assert.equal(module[0]?.level, "danger");
  });

  it("flags comm lost, empty history, and active faults", () => {
    const empty = extractWatchAnomalies(
      buildWatchFacts({
        installationId: "PSVG-DONGTAN01",
        hours: 24,
        lastSeenAt: "2026-09-01T00:00:00Z",
        now: Date.parse("2026-09-01T01:00:00Z"),
        readings: [],
      }),
      { activeFaultCount: 2 },
    );
    const codes = empty.map((a) => a.code).sort();
    assert.deepEqual(codes, ["active_faults", "comm_lost", "no_readings"]);
    assert.equal(empty[0]?.level, "danger");
  });
});
