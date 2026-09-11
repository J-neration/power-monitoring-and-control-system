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
    assert.equal(empty.find((a) => a.code === "comm_lost")?.title, "통신 끊김");
    assert.equal(empty.find((a) => a.code === "comm_lost")?.scope, "now");
  });

  it("explains zero voltage as missing, not 10% over nominal", () => {
    const anomalies = extractWatchAnomalies(
      factsFrom([{ ...healthy, vL1: 0, vL2: 0, vL3: 0 }]),
    );
    const volt = anomalies.find((a) => a.code === "voltage_deviation");
    assert.equal(volt?.title, "전압 없음");
    assert.match(volt?.message ?? "", /0V/);
    assert.equal(volt?.scope, "window");
    assert.equal(volt?.at, "2026-09-01T08:00:00.000Z");
    assert.equal(/10%를 초과/.test(volt?.message ?? ""), false);
  });

  it("treats leading PF by magnitude, so -100% is healthy", () => {
    const unityLead = extractWatchAnomalies(
      factsFrom([
        { ...healthy, recordedAt: "2026-09-01T01:00:00Z", dpf2: -100 },
        { ...healthy, recordedAt: "2026-09-01T08:00:00Z", dpf2: 99 },
      ]),
    );
    assert.equal(unityLead.some((a) => a.code === "dpf_after_low"), false);

    const lowLead = extractWatchAnomalies(
      factsFrom([
        { ...healthy, recordedAt: "2026-09-01T01:00:00Z", tpf2: -70 },
        { ...healthy, recordedAt: "2026-09-01T08:00:00Z", tpf2: 98 },
      ]),
    );
    const tpf = lowLead.find((a) => a.code === "tpf_after_low");
    assert.equal(tpf?.title, "종합역률 낮음");
    assert.equal(tpf?.level, "danger");
    assert.match(tpf?.message ?? "", /최근 24시간 중 최저 70% \(진상\)/);
    assert.equal(tpf?.at, "2026-09-01T01:00:00.000Z");
  });

  it("ignores THD and PF measured at light load", () => {
    const nightSpike = extractWatchAnomalies(
      factsFrom([
        {
          ...healthy,
          recordedAt: "2026-09-01T02:00:00Z",
          gridCurrentL1: 120,
          gridCurrentTHDL1: 2.1,
        },
        // 심야 경부하 — 기본파가 작아 THD-i와 역률이 무너진 것처럼 보인다
        {
          ...healthy,
          recordedAt: "2026-09-01T04:00:00Z",
          gridCurrentL1: 3,
          gridCurrentTHDL1: 46,
          tpf2: 42,
        },
        {
          ...healthy,
          recordedAt: "2026-09-01T08:00:00Z",
          gridCurrentL1: 118,
          gridCurrentTHDL1: 2.4,
        },
      ]),
    );
    assert.deepEqual(nightSpike, []);

    const underLoad = extractWatchAnomalies(
      factsFrom([
        { ...healthy, gridCurrentL1: 120, gridCurrentTHDL1: 46, tpf2: 42 },
      ]),
    );
    assert.equal(underLoad.some((a) => a.code === "thd_grid_high"), true);
    assert.equal(underLoad.some((a) => a.code === "tpf_after_low"), true);
  });

  it("treats a near-zero power factor as unmeasured, not as the worst sample", () => {
    const anomalies = extractWatchAnomalies(
      factsFrom([
        { ...healthy, recordedAt: "2026-09-01T02:00:00Z", tpf2: 0 },
        { ...healthy, recordedAt: "2026-09-01T08:00:00Z", tpf2: 98 },
      ]),
    );
    assert.equal(anomalies.some((a) => a.code === "tpf_after_low"), false);
  });

  it("does not blame the grid side while every module is stopped", () => {
    const anomalies = extractWatchAnomalies(
      factsFrom([
        { ...healthy, moduleStatus: [0, 0], gridCurrentTHDL1: 46, tpf2: 42 },
      ]),
    );
    assert.deepEqual(anomalies, []);
  });

  it("flags a filter that is not pulling load-side distortion down", () => {
    const working = extractWatchAnomalies(
      factsFrom([{ ...healthy, loadCurrentTHDL1: 28, gridCurrentTHDL1: 2.4 }]),
    );
    assert.equal(working.some((a) => a.code === "thd_not_compensated"), false);

    const weak = extractWatchAnomalies(
      factsFrom([{ ...healthy, loadCurrentTHDL1: 28, gridCurrentTHDL1: 19 }]),
    );
    const warn = weak.find((a) => a.code === "thd_not_compensated");
    assert.equal(warn?.level, "warn");
    assert.equal(warn?.title, "고조파 보상 미흡");
    assert.match(warn?.message ?? "", /부하측 28% → 계통측 19%/);

    const idle = extractWatchAnomalies(
      factsFrom([{ ...healthy, loadCurrentTHDL1: 28, gridCurrentTHDL1: 26 }]),
    );
    assert.equal(
      idle.find((a) => a.code === "thd_not_compensated")?.level,
      "danger",
    );
  });

  it("flags compensation that barely improves the power factor", () => {
    const working = extractWatchAnomalies(
      factsFrom([{ ...healthy, tpf1: 76, tpf2: 98 }]),
    );
    assert.equal(working.some((a) => a.code === "pf_not_compensated"), false);

    const weak = extractWatchAnomalies(
      factsFrom([{ ...healthy, tpf1: 76, tpf2: 78 }]),
    );
    assert.equal(
      weak.find((a) => a.code === "pf_not_compensated")?.level,
      "warn",
    );

    const idle = extractWatchAnomalies(
      factsFrom([{ ...healthy, tpf1: 76, tpf2: 76.5 }]),
    );
    assert.equal(
      idle.find((a) => a.code === "pf_not_compensated")?.level,
      "danger",
    );
  });

  it("flags module fault and offline states from moduleStatus", () => {
    const faulted = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleStatus: [2, 2, 3, 2, 2, 2], numOfMods: 6 }]),
    );
    const fault = faulted.find((a) => a.code === "module_fault_state");
    assert.equal(fault?.level, "danger");
    assert.equal(fault?.scope, "now");

    const partly = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleStatus: [2, 2, 4, 4, 2, 2], numOfMods: 6 }]),
    );
    const offline = partly.find((a) => a.code === "module_offline");
    assert.equal(offline?.level, "warn");
    assert.equal(offline?.value, 2);

    const allDown = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleStatus: [4, 4, 4, 4, 4, 4], numOfMods: 6 }]),
    );
    assert.equal(
      allDown.find((a) => a.code === "module_offline")?.level,
      "danger",
    );
  });

  it("flags a stopped fan only while modules are running", () => {
    const running = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleStatus: [2, 2], fanSpeed: [8.1, 0] }]),
    );
    const fan = running.find((a) => a.code === "fan_stopped");
    assert.equal(fan?.level, "danger");
    assert.equal(fan?.value, 1);

    const idle = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleStatus: [0, 0], fanSpeed: [0, 0] }]),
    );
    assert.equal(idle.some((a) => a.code === "fan_stopped"), false);
  });

  it("flags one module running hotter than its peers", () => {
    const even = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleTemp: [38, 39, 40, 38, 39, 38] }]),
    );
    assert.equal(even.some((a) => a.code === "module_temp_spread"), false);

    const uneven = extractWatchAnomalies(
      factsFrom([{ ...healthy, moduleTemp: [38, 39, 52, 38, 39, 38] }]),
    );
    const spread = uneven.find((a) => a.code === "module_temp_spread");
    assert.equal(spread?.level, "warn");
    assert.equal(spread?.value, 14);
  });

  it("flags a filter running at the top of its capacity", () => {
    const headroom = extractWatchAnomalies(
      factsFrom([
        { ...healthy, totalCapacity: 200, operatingCapacity: 120, availableMargin: 80 },
      ]),
    );
    assert.equal(headroom.some((a) => a.code === "capacity_saturated"), false);

    const full = extractWatchAnomalies(
      factsFrom([
        { ...healthy, totalCapacity: 200, operatingCapacity: 196, availableMargin: 4 },
      ]),
    );
    const cap = full.find((a) => a.code === "capacity_saturated");
    assert.equal(cap?.level, "warn");
    assert.equal(cap?.value, 98);
  });

  it("sorts danger above warn regardless of scope", () => {
    const anomalies = extractWatchAnomalies(
      factsFrom([
        {
          ...healthy,
          // now/warn (모듈 일부 정지) + window/danger (계통 THD)
          moduleStatus: [2, 2, 4, 2, 2, 2],
          numOfMods: 6,
          gridCurrentL1: 120,
          gridCurrentTHDL1: 24,
        },
      ]),
    );
    assert.equal(anomalies[0]?.code, "thd_grid_high");
    assert.equal(anomalies[0]?.level, "danger");
    assert.equal(anomalies[1]?.code, "module_offline");
  });
});
