/**
 * 관제 화면이 상태·용량·경고 색을 정하는 규칙.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeviceStatus, Site } from "../types/site";
import {
  deriveSiteStatus,
  installationMatchesFilter,
  siteMatchesFilter,
  sortByLabel,
  sortSitesByName,
  sortSitesByPriority,
} from "./deviceStatus";
import { getPfLevel, getVoltageLevel, maxThd } from "./metricThreshold";
import { facilityCapacity, snapNearRatedKvar, sumModuleCapacity } from "./ratedKvar";

const HOUR = 3600_000;

const site = (name: string, devices: Array<{ status: DeviceStatus; lastSeenAt?: string | null } | null>): Site =>
  ({
    siteId: name,
    name,
    installations: devices.map((device, i) => ({
      id: `${name}-${i}`,
      label: `${i}`,
      device: device ? { installationId: `${name}-${i}`, lastSeenAt: null, ...device } : null,
    })),
  }) as unknown as Site;

describe("site status", () => {
  it("is the worst installation status", () => {
    assert.equal(deriveSiteStatus(site("a", [{ status: "running" }, { status: "running" }])), "running");
    assert.equal(deriveSiteStatus(site("a", [{ status: "running" }, { status: "standby" }])), "standby");
    assert.equal(deriveSiteStatus(site("a", [{ status: "offline" }, { status: "standby" }])), "offline");
    assert.equal(deriveSiteStatus(site("a", [{ status: "offline" }, { status: "fault" }])), "fault");
  });

  it("treats an installation without a device as offline", () => {
    assert.equal(deriveSiteStatus(site("a", [{ status: "running" }, null])), "offline");
  });
});

describe("status filters", () => {
  const recent = new Date(Date.now() - 60_000).toISOString();
  const stale = new Date(Date.now() - 2 * HOUR).toISOString();

  it("finds fault, offline and comm-lost sites", () => {
    const s = site("a", [{ status: "running", lastSeenAt: recent }, { status: "fault", lastSeenAt: stale }]);
    assert.equal(siteMatchesFilter(s, "all"), true);
    assert.equal(siteMatchesFilter(s, "fault"), true);
    assert.equal(siteMatchesFilter(s, "offline"), false);
    assert.equal(siteMatchesFilter(s, "comm_lost"), true);
  });

  it("does not call a never-reporting device comm-lost", () => {
    assert.equal(siteMatchesFilter(site("a", [{ status: "offline", lastSeenAt: null }]), "comm_lost"), false);
  });

  it("filters single installations", () => {
    assert.equal(installationMatchesFilter("fault", "fault"), true);
    assert.equal(installationMatchesFilter("running", "fault"), false);
    assert.equal(installationMatchesFilter("running", "comm_lost", true), true);
  });
});

describe("ordering", () => {
  it("sorts Korean names with numbers naturally (2동 before 10동)", () => {
    const sorted = sortByLabel([{ label: "10동" }, { label: "2동" }, { label: "가동" }, { label: "1동" }]);
    assert.deepEqual(sorted.map((x) => x.label), ["1동", "2동", "10동", "가동"]);
  });

  it("keeps the list order by name regardless of status", () => {
    const sites = [site("나 현장", [{ status: "fault" }]), site("가 현장", [{ status: "running" }])];
    assert.deepEqual(sortSitesByName(sites).map((s) => s.name), ["가 현장", "나 현장"]);
  });

  it("visits fault sites first in control-room rotation", () => {
    const sites = [
      site("가", [{ status: "running" }]),
      site("나", [{ status: "fault" }]),
      site("다", [{ status: "offline" }]),
    ];
    assert.deepEqual(sortSitesByPriority(sites).map((s) => s.name), ["나", "다", "가"]);
  });
});

describe("metric warning levels", () => {
  it("flags voltage beyond ±5% / ±10% of 220 V", () => {
    assert.equal(getVoltageLevel(220), "normal");
    assert.equal(getVoltageLevel(231), "normal");
    assert.equal(getVoltageLevel(232), "warn");
    assert.equal(getVoltageLevel(243), "danger");
    assert.equal(getVoltageLevel(196), "danger");
    assert.equal(getVoltageLevel(null), "normal");
  });

  it("flags power factor below 90% / 85%", () => {
    assert.equal(getPfLevel(95), "normal");
    assert.equal(getPfLevel(89.9), "warn");
    assert.equal(getPfLevel(84.9), "danger");
  });

  it("uses the worst finite THD", () => {
    assert.equal(maxThd(null, undefined, Number.NaN), "normal");
    assert.equal(maxThd(1, 2, 3), "normal");
    assert.equal(maxThd(1, 999), "danger");
  });
});

describe("facility capacity", () => {
  it("snaps an HMI-computed kvar to the rated table only when it is close", () => {
    assert.equal(snapNearRatedKvar(34.6), 35);
    assert.equal(snapNearRatedKvar(66), 65);
    assert.equal(snapNearRatedKvar(135.4), 135);
    // 35 의 허용폭은 가까운 이웃(50)까지 거리의 절반 = 7.5. 17 쪽으로 8 떨어진 27 은 그대로.
    assert.equal(snapNearRatedKvar(27), 27);
    assert.equal(snapNearRatedKvar(200), 200);
  });

  it("sums module capacities, keeping amps as-is", () => {
    assert.equal(sumModuleCapacity([34.6, 34.6, 50.2]), 120);
    assert.equal(sumModuleCapacity([50, 50], "A"), 100);
    assert.equal(sumModuleCapacity([]), null);
    assert.equal(sumModuleCapacity(null), null);
  });

  it("falls back to the module sum when telemetry total is 0 or missing", () => {
    assert.equal(facilityCapacity(150, 120), 150);
    assert.equal(facilityCapacity(0, 120), 120);
    assert.equal(facilityCapacity(null, 120), 120);
    assert.equal(facilityCapacity(0, null), null);
  });
});
