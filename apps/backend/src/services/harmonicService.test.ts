import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHarmonicHistory,
  harmonicRecordedAt,
  harmonicVoltRecordedAt,
  type HarmonicHistorySample,
} from "./harmonicService.js";

test("harmonicRecordedAt: uses the HMI time when it is sane", () => {
  const now = new Date("2026-11-26T03:00:00Z");
  const ts = Math.floor(new Date("2026-11-26T02:59:10Z").getTime() / 1000);
  assert.equal(harmonicRecordedAt(ts, now).toISOString(), "2026-11-26T02:59:10.000Z");
  // milliseconds are accepted too
  assert.equal(harmonicRecordedAt(ts * 1000, now).toISOString(), "2026-11-26T02:59:10.000Z");
});

test("harmonicRecordedAt: falls back to the receive time for a missing or wrong clock", () => {
  const now = new Date("2026-11-26T03:00:00Z");
  assert.equal(harmonicRecordedAt(undefined, now), now);
  assert.equal(harmonicRecordedAt(0, now), now); // HMI clock not set (1970)
  assert.equal(harmonicRecordedAt(now.getTime() / 1000 + 3600, now), now); // 1 h in the future
  // RTC left at 2024-11-02 (bench board, 2026-11-26): a valid-looking year is not enough
  assert.equal(harmonicRecordedAt(1730588405, now), now);
  // 3 h behind
  assert.equal(harmonicRecordedAt(now.getTime() / 1000 - 3 * 3600, now), now);
});

test("harmonicRecordedAt: keeps a read up to 2 h old (normal 30 min refresh)", () => {
  const now = new Date("2026-11-26T03:00:00Z");
  const ts = now.getTime() / 1000 - 100 * 60;
  assert.equal(harmonicRecordedAt(ts, now).getTime(), ts * 1000);
});


test("harmonicVoltRecordedAt: keeps the HMI gap between the current and voltage reads", () => {
  const recordedAt = new Date("2026-11-27T03:00:00Z");
  const ts = 1764212400; // any HMI clock: only the difference counts
  // voltage read 2 s after the currents
  assert.equal(harmonicVoltRecordedAt(recordedAt, ts, ts + 2).toISOString(), "2026-11-27T03:00:02.000Z");
  // last voltage read failed: the value is from 3 h earlier
  assert.equal(harmonicVoltRecordedAt(recordedAt, ts, ts - 3 * 3600).toISOString(), "2026-11-27T00:00:00.000Z");
  // a time missing: same as the currents
  assert.equal(harmonicVoltRecordedAt(recordedAt, undefined, ts), recordedAt);
  assert.equal(harmonicVoltRecordedAt(recordedAt, ts, undefined), recordedAt);
  // far in the future of the currents: not believable
  assert.equal(harmonicVoltRecordedAt(recordedAt, ts, ts + 3600), recordedAt);
});

const sample = (iso: string, v5: number, volt = true): HarmonicHistorySample => ({
  recordedAt: new Date(iso),
  orders: [1, 3, 5],
  uncompA: [10000, 200, v5],
  uncompB: [10000, 200, v5 + 100],
  uncompC: [10000, 200, v5 + 200],
  compA: [10000, 20, Math.round(v5 / 10)],
  compB: [10000, 20, Math.round(v5 / 10)],
  compC: [10000, 20, Math.round(v5 / 10)],
  // 0.1 V: 1st 220.0 V, 5th v5/100 V
  voltA: volt ? [2200, 30, Math.round(v5 / 10)] : [],
  voltB: volt ? [2210, 30, Math.round(v5 / 10) + 5] : [],
  voltC: volt ? [2190, 30, Math.round(v5 / 10) + 10] : [],
});

test("buildHarmonicHistory raw: one point per record, picked order in A", () => {
  const pts = buildHarmonicHistory(
    [sample("2026-11-26T01:00:00Z", 3000), sample("2026-11-26T00:00:00Z", 2900)],
    5,
    "raw",
    "avg",
  );
  assert.equal(pts.length, 2);
  assert.equal(pts[0].recordedAt.toISOString(), "2026-11-26T00:00:00.000Z"); // sorted
  assert.deepEqual(pts[1].uncomp, { a: 30, b: 31, c: 32 });
  assert.deepEqual(pts[1].comp, { a: 3, b: 3, c: 3 });
  assert.deepEqual(pts[1].volt, { a: 30, b: 30.5, c: 31 });
});

test("buildHarmonicHistory: a record without voltage gives null voltage, currents unchanged", () => {
  const rows = [sample("2026-11-26T00:00:00Z", 3000, false), sample("2026-11-26T01:00:00Z", 1000)];
  const raw = buildHarmonicHistory(rows, 5, "raw", "avg");
  assert.deepEqual(raw[0].volt, { a: null, b: null, c: null });
  assert.deepEqual(raw[0].uncomp, { a: 30, b: 31, c: 32 });
  // in a bucket the record without voltage is left out of the voltage average
  const daily = buildHarmonicHistory(rows, 5, "daily", "avg");
  assert.equal(daily[0].volt.a, 10);
  assert.equal(daily[0].uncomp.a, 20);
});

test("buildHarmonicHistory daily: buckets by KST day with min/avg/max", () => {
  // 2026-11-26 KST = 2026-11-25T15:00Z .. 2026-11-26T15:00Z
  const rows = [
    sample("2026-11-25T16:00:00Z", 1000),
    sample("2026-11-26T02:00:00Z", 3000),
    sample("2026-11-26T16:00:00Z", 5000), // next KST day
  ];
  const avg = buildHarmonicHistory(rows, 5, "daily", "avg");
  assert.equal(avg.length, 2);
  assert.equal(avg[0].recordedAt.toISOString(), "2026-11-25T15:00:00.000Z");
  assert.equal(avg[0].uncomp.a, 20);
  assert.equal(buildHarmonicHistory(rows, 5, "daily", "max")[0].uncomp.a, 30);
  assert.equal(buildHarmonicHistory(rows, 5, "daily", "min")[0].uncomp.a, 10);
});

test("buildHarmonicHistory: an order the record does not have gives null", () => {
  const pts = buildHarmonicHistory([sample("2026-11-26T00:00:00Z", 3000)], 49, "raw", "avg");
  assert.deepEqual(pts[0].uncomp, { a: null, b: null, c: null });
});
