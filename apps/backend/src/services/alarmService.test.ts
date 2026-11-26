import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMM_LOST_AFTER_MS } from "../lib/commStatus.js";
import { alarmKindFor, planAlarmSync, type InstallationSnapshot } from "./alarmService.js";

const now = Date.parse("2026-11-26T03:00:00Z");
const fresh = new Date(now - 5 * 60 * 1000);
const stale = new Date(now - COMM_LOST_AFTER_MS - 1000);

const inst = (id: string, moduleStatus: number[] | null, lastSeenAt: Date | null): InstallationSnapshot => ({
  id,
  device: { moduleStatus, lastSeenAt },
});

describe("alarmKindFor", () => {
  it("running device → no alarm", () => {
    assert.equal(alarmKindFor(inst("A", [2, 2], fresh), now), null);
  });
  it("fault module → fault", () => {
    assert.equal(alarmKindFor(inst("A", [2, 3], fresh), now), "fault");
  });
  it("comm lost wins over fault", () => {
    assert.equal(alarmKindFor(inst("A", [3], stale), now), "comm_lost");
  });
  it("no device row → offline", () => {
    assert.equal(alarmKindFor({ id: "A", device: null }, now), "offline");
  });
  it("all modules offline → offline", () => {
    assert.equal(alarmKindFor(inst("A", [4, 4], fresh), now), "offline");
  });
});

describe("planAlarmSync", () => {
  it("raises new alarms", () => {
    const plan = planAlarmSync([inst("A", [3], fresh), inst("B", [2], fresh)], [], now);
    assert.deepEqual(plan, { raise: [{ installationId: "A", kind: "fault" }], clear: [] });
  });

  it("keeps an alarm that is still active", () => {
    const plan = planAlarmSync([inst("A", [3], fresh)], [{ id: 1, installationId: "A", kind: "fault" }], now);
    assert.deepEqual(plan, { raise: [], clear: [] });
  });

  it("clears an alarm that resolved", () => {
    const plan = planAlarmSync([inst("A", [2], fresh)], [{ id: 1, installationId: "A", kind: "fault" }], now);
    assert.deepEqual(plan, { raise: [], clear: [1] });
  });

  it("kind change clears old and raises new", () => {
    const plan = planAlarmSync([inst("A", [3], stale)], [{ id: 1, installationId: "A", kind: "fault" }], now);
    assert.deepEqual(plan, { raise: [{ installationId: "A", kind: "comm_lost" }], clear: [1] });
  });

  it("closes duplicate open rows, keeps the first", () => {
    const plan = planAlarmSync(
      [inst("A", [3], fresh)],
      [
        { id: 1, installationId: "A", kind: "fault" },
        { id: 2, installationId: "A", kind: "fault" },
      ],
      now,
    );
    assert.deepEqual(plan, { raise: [], clear: [2] });
  });

  it("clears alarms of deleted installations", () => {
    const plan = planAlarmSync([], [{ id: 7, installationId: "GONE", kind: "offline" }], now);
    assert.deepEqual(plan, { raise: [], clear: [7] });
  });

  it("handles installation ids containing colons", () => {
    const plan = planAlarmSync([inst("X:1", [3], fresh)], [], now);
    assert.deepEqual(plan.raise, [{ installationId: "X:1", kind: "fault" }]);
  });
});
