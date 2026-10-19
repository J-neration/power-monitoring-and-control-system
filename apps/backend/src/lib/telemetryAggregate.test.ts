import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysInMonth, isLeapYear, kstDateKey, kstDayStart } from "./kstBuckets.js";
import { resolveHistoryQuery } from "./historyRange.js";
import { retentionConfigFrom } from "./retentionConfig.js";
import {
  aggregateSamples,
  buildHistoryFromSamples,
  dedupeSamples,
  estimateEnergy,
  hourEligibleForPurge,
  mergeStats,
  mergeSummaries,
  type RawSample,
} from "./telemetryAggregate.js";

const at = (iso: string) => new Date(iso);

function sample(
  iso: string,
  values: RawSample["values"],
  extra?: Partial<RawSample>,
): RawSample {
  return {
    id: extra?.id ?? iso,
    recordedAt: at(iso),
    receivedAt: extra?.receivedAt ?? at(iso),
    values,
    arrays: extra?.arrays ?? {},
  };
}

describe("retentionConfigFrom", () => {
  it("uses the retention defaults and keeps purge off", () => {
    const cfg = retentionConfigFrom({});
    assert.equal(cfg.rawDays, 180);
    assert.equal(cfg.hourlyDays, 365);
    assert.equal(cfg.dailyDays, 1825);
    assert.equal(cfg.rawPurgeEnabled, false);
    assert.equal(cfg.summaryPurgeEnabled, false);
    assert.equal(cfg.aggregationEnabled, true);
  });

  it("reads overrides without code changes", () => {
    const cfg = retentionConfigFrom({
      RAW_DATA_RETENTION_DAYS: "90",
      RAW_PURGE_ENABLED: "true",
      AGGREGATION_ENABLED: "off",
    });
    assert.equal(cfg.rawDays, 90);
    assert.equal(cfg.rawPurgeEnabled, true);
    assert.equal(cfg.aggregationEnabled, false);
  });
});

describe("KST calendar", () => {
  it("treats 2024-02-29 as a real KST day and rolls to March 1", () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(daysInMonth(2024, 2), 29);
    const day = kstDayStart(at("2024-02-29T15:00:00+09:00"));
    assert.equal(kstDateKey(day), "2024-02-29");
    assert.equal(kstDateKey(new Date(day.getTime() + 24 * 60 * 60 * 1000)), "2024-03-01");
  });
});

describe("dedupe and stats", () => {
  it("keeps the later reception and ignores nulls without turning them into zero", () => {
    const rows = dedupeSamples([
      sample("2026-10-01T01:00:00Z", { vL1: 10 }, { id: "a", receivedAt: at("2026-10-01T01:00:05Z") }),
      sample("2026-10-01T01:00:00Z", { vL1: 30 }, { id: "b", receivedAt: at("2026-10-01T01:00:20Z") }),
      sample("2026-10-01T01:10:00Z", { vL1: null }),
      sample("2026-10-01T01:20:00Z", { vL1: 20 }),
    ]);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].values.vL1, 30);
    const summary = aggregateSamples(rows, 6, 10 * 60 * 1000);
    assert.ok(summary);
    assert.equal(summary.sampleCount, 3);
    assert.equal(summary.expectedCount, 6);
    assert.equal(summary.metrics.vL1?.n, 2);
    assert.equal(summary.metrics.vL1?.avg, 25);
    assert.equal(summary.metrics.vL1?.min, 20);
    assert.equal(summary.metrics.vL1?.max, 30);
  });

  it("keeps a real zero and the sign of a measurement", () => {
    const summary = aggregateSamples(
      [
        sample("2026-10-01T01:00:00Z", { uncompQ: 0 }),
        sample("2026-10-01T01:10:00Z", { uncompQ: -4 }),
      ],
      6,
      10 * 60 * 1000,
    );
    assert.equal(summary?.metrics.uncompQ?.avg, -2);
    assert.equal(summary?.metrics.uncompQ?.min, -4);
    assert.equal(summary?.metrics.uncompQ?.n, 2);
  });

  it("weights power factor by active power and falls back to an arithmetic mean", () => {
    const weighted = aggregateSamples(
      [
        sample("2026-10-01T01:00:00Z", { tpf1: 80, uncompP: 10 }),
        sample("2026-10-01T01:10:00Z", { tpf1: -40, uncompP: 30 }),
      ],
      6,
      10 * 60 * 1000,
    );
    assert.equal(weighted?.metrics.tpf1?.avg, (80 * 10 + 40 * 30) / 40);
    assert.equal(weighted?.metrics.tpf1?.min, -40);
    assert.equal(weighted?.metrics.tpf1?.max, 80);
    assert.equal(weighted?.metrics.tpf1?.sum, 80 * 10 + 40 * 30);

    const plain = aggregateSamples(
      [
        sample("2026-10-01T01:00:00Z", { tpf2: 90, compP: 0 }),
        sample("2026-10-01T01:10:00Z", { tpf2: 70, compP: 0 }),
      ],
      6,
      10 * 60 * 1000,
    );
    assert.equal(plain?.metrics.tpf2?.avg, 80);
  });

  it("returns no summary when the bucket is empty", () => {
    assert.equal(aggregateSamples([], 6, 600_000), null);
  });
});

describe("energy", () => {
  it("integrates instantaneous power over the sample interval and does not fill a long gap", () => {
    const interval = 10 * 60 * 1000;
    const energy = estimateEnergy(
      [
        sample("2026-10-01T00:00:00Z", { compP: 6, uncompP: 12 }),
        sample("2026-10-01T00:10:00Z", { compP: 12 }),
        sample("2026-10-01T01:10:00Z", { compP: 60 }),
      ],
      interval,
    );
    assert.equal(energy.compEnergyKwh, 6 * (10 / 60) + 12 * (10 / 60) + 60 * (10 / 60));
    assert.equal(energy.uncompEnergyKwh, 12 * (10 / 60));
  });

  it("uses the real gap when samples are within two intervals", () => {
    const energy = estimateEnergy(
      [
        sample("2026-10-01T00:00:00Z", { compP: 6 }),
        sample("2026-10-01T00:20:00Z", { compP: 0 }),
      ],
      10 * 60 * 1000,
    );
    assert.equal(energy.compEnergyKwh, 6 * (20 / 60) + 0);
  });

  it("is null rather than zero when power was never reported", () => {
    const energy = estimateEnergy(
      [sample("2026-10-01T00:00:00Z", { vL1: 220 })],
      10 * 60 * 1000,
    );
    assert.equal(energy.compEnergyKwh, null);
    assert.equal(energy.uncompEnergyKwh, null);
  });
});

describe("hourly to daily", () => {
  it("uses sample-weighted averages and the outer min and max", () => {
    const hour = (avg: number, n: number, min: number, max: number) =>
      aggregateSamples(
        Array.from({ length: n }, (_, i) =>
          sample(`2026-10-01T0${i}:00:00Z`, { vL1: i === 0 ? min : i === n - 1 ? max : avg }),
        ),
        6,
        600_000,
      );
    const low = hour(10, 2, 10, 10);
    const high = hour(20, 4, 18, 22);
    assert.ok(low && high);
    low.metrics.vL1 = { avg: 10, min: 10, max: 10, n: 2, sum: 20, weight: 0 };
    high.metrics.vL1 = { avg: 20, min: 18, max: 22, n: 4, sum: 80, weight: 0 };
    const day = mergeSummaries([low, high], 144);
    assert.equal(day?.metrics.vL1?.avg, 100 / 6);
    assert.equal(day?.metrics.vL1?.min, 10);
    assert.equal(day?.metrics.vL1?.max, 22);
    assert.equal(day?.sampleCount, low.sampleCount + high.sampleCount);
  });

  it("merges power-weighted power factor by weight, not by hour", () => {
    const merged = mergeStats([
      { avg: 80, min: 80, max: 80, n: 2, sum: 800, weight: 10 },
      { avg: 40, min: 40, max: 40, n: 2, sum: 1200, weight: 30 },
    ]);
    assert.equal(merged.avg, 2000 / 40);
    assert.equal(merged.min, 40);
    assert.equal(merged.max, 80);
  });
});

describe("history series", () => {
  it("draws a gap instead of a zero when a raw interval is missing", () => {
    const series = buildHistoryFromSamples({
      installationId: "dev-1",
      resolution: "raw",
      aggregation: "avg",
      from: at("2026-10-01T00:00:00Z"),
      to: at("2026-10-01T01:00:00Z"),
      intervalMs: 10 * 60 * 1000,
      samples: [
        sample("2026-10-01T00:00:00Z", { vL1: 220 }),
        sample("2026-10-01T00:40:00Z", { vL1: 221 }),
      ],
    });
    assert.equal(series.gapCount, 1);
    assert.equal(series.points[1].gap, true);
    assert.equal(series.points[1].vL1, undefined);
    assert.notEqual(series.points[1].vL1, 0);
  });

  it("builds one daily point per KST day and leaves an empty day as a gap", () => {
    const series = buildHistoryFromSamples({
      installationId: "dev-1",
      resolution: "daily",
      aggregation: "max",
      from: kstDayStart(at("2026-10-01T12:00:00+09:00")),
      to: kstDayStart(at("2026-10-03T12:00:00+09:00")),
      intervalMs: 10 * 60 * 1000,
      samples: [
        sample("2026-10-01T01:00:00Z", { vL1: 210 }),
        sample("2026-10-01T02:00:00Z", { vL1: 230 }),
      ],
    });
    assert.equal(series.points.length, 2);
    assert.equal(series.points[0].vL1, 230);
    assert.equal(series.points[0].metricMin?.vL1, 210);
    assert.equal(series.points[0].metricMax?.vL1, 230);
    assert.equal(series.points[1].gap, true);
    assert.equal(series.gapCount, 1);
  });
});

describe("history query", () => {
  const now = at("2026-10-19T03:00:00Z");

  it("selects raw, hourly, and daily sources from the period", () => {
    const day = resolveHistoryQuery({ period: "day", now });
    const week = resolveHistoryQuery({ period: "week", now });
    const month = resolveHistoryQuery({ period: "month", now });
    const year = resolveHistoryQuery({ period: "year", now });
    assert.equal(day.ok && day.value.resolution, "raw");
    assert.equal(week.ok && week.value.resolution, "hourly");
    assert.equal(month.ok && month.value.resolution, "daily");
    assert.equal(year.ok && year.value.resolution, "daily");
  });

  it("covers the leap-year calendar and a selected month", () => {
    const year = resolveHistoryQuery({ period: "year", start: "2024", now });
    assert.equal(year.ok, true);
    if (!year.ok) return;
    assert.equal((year.value.to.getTime() - year.value.from.getTime()) / 86_400_000, 366);
    const month = resolveHistoryQuery({ period: "month", start: "2024-02", now });
    assert.equal(month.ok, true);
    if (!month.ok) return;
    assert.equal((month.value.to.getTime() - month.value.from.getTime()) / 86_400_000, 29);
  });

  it("rejects a raw year query", () => {
    const result = resolveHistoryQuery({ period: "year", resolution: "raw", now });
    assert.equal(result.ok, false);
  });
});

describe("purge guard", () => {
  const rawAt = at("2026-01-01T00:10:00Z");
  const hourlyAt = at("2026-01-02T00:00:00Z");
  const dailyAt = at("2026-01-02T00:05:00Z");

  it("blocks deletion until hourly and daily summaries match the raw hour", () => {
    assert.equal(
      hourEligibleForPurge({
        rawSampleCount: 6,
        hourlySampleCount: null,
        hourlyUpdatedAt: null,
        latestRawAt: rawAt,
        dailyUpdatedAt: dailyAt,
      }).ok,
      false,
    );
    assert.equal(
      hourEligibleForPurge({
        rawSampleCount: 6,
        hourlySampleCount: 5,
        hourlyUpdatedAt: hourlyAt,
        latestRawAt: rawAt,
        dailyUpdatedAt: dailyAt,
      }).ok,
      false,
    );
    assert.deepEqual(
      hourEligibleForPurge({
        rawSampleCount: 6,
        hourlySampleCount: 6,
        hourlyUpdatedAt: hourlyAt,
        latestRawAt: rawAt,
        dailyUpdatedAt: dailyAt,
      }),
      { ok: true },
    );
  });
});
