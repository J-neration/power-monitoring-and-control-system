import test from "node:test";
import assert from "node:assert/strict";
import { intervalLabel, observedIntervalMinutes } from "./reportInterval.js";

const at = (minutes: number[]) =>
  minutes.map((m) => ({ recordedAt: new Date(Date.UTC(2026, 10, 27, 0, m)).toISOString() }));

test("observedIntervalMinutes: 10-minute and 30-minute devices", () => {
  assert.equal(observedIntervalMinutes(at([0, 10, 20, 30, 40])), 10);
  assert.equal(observedIntervalMinutes(at([0, 30, 60, 90, 120])), 30);
});

test("observedIntervalMinutes: one missed report or a jittery clock does not change it", () => {
  assert.equal(observedIntervalMinutes(at([0, 10, 30, 40, 50, 60])), 10);
  assert.equal(observedIntervalMinutes(at([0, 31, 60, 89, 120])), 30);
});

test("observedIntervalMinutes: too few points or gap markers", () => {
  assert.equal(observedIntervalMinutes(at([0, 10, 20])), null);
  const withGap = [...at([0, 30]), { recordedAt: at([45])[0].recordedAt, gap: true }, ...at([60, 90])];
  assert.equal(observedIntervalMinutes(withGap), 30);
});

test("intervalLabel", () => {
  assert.equal(intervalLabel(10), "10분");
  assert.equal(intervalLabel(60), "1시간");
  assert.equal(intervalLabel(null), "원본");
});

test("observedIntervalMinutes: an unusual interval is rounded, not forced", () => {
  assert.equal(observedIntervalMinutes(at([0, 45, 90, 135, 180])), 45);
});
