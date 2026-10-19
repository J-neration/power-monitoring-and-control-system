/**
 * 10분 원본 → 시간/일 요약.
 * 평균은 NULL을 빼고 계산한다. 결측을 0으로 바꾸지 않는다.
 * 역률 평균은 |PF|를 유효전력 |P|로 가중한다. -90과 90이 0으로 상쇄되지 않게 한다.
 * 역률의 최소·최대는 부호를 유지한다.
 * 전력량(kWh)은 누적 계량이 없어 순간전력의 시간 적분이며 추정값이다.
 */

import { addDays, addHours, kstDayStart, kstHourStart } from "./kstBuckets.js";

export const SCALAR_METRICS = [
  "vL1",
  "vL2",
  "vL3",
  "gridCurrentL1",
  "gridCurrentL2",
  "gridCurrentL3",
  "loadCurrentL1",
  "loadCurrentL2",
  "loadCurrentL3",
  "loadCurrentTHDL1",
  "loadCurrentTHDL2",
  "loadCurrentTHDL3",
  "gridCurrentTHDL1",
  "gridCurrentTHDL2",
  "gridCurrentTHDL3",
  "uncompS",
  "compS",
  "uncompP",
  "compP",
  "uncompQ",
  "compQ",
  "uncompH",
  "compH",
  "tpf1",
  "tpf2",
  "dpf1",
  "dpf2",
  "totalCapacity",
  "operatingCapacity",
  "reactivePowerCapacity",
  "availableMargin",
  "csq",
  "rsrp",
] as const;

export const ARRAY_METRICS = ["areaTemp", "moduleTemp", "fanSpeed"] as const;

export type ScalarMetric = (typeof SCALAR_METRICS)[number];
export type ArrayMetric = (typeof ARRAY_METRICS)[number];
export type HistoryAggregation = "avg" | "min" | "max";
export type HistoryResolution = "raw" | "hourly" | "daily";

const PF_SIDE: Partial<Record<ScalarMetric, "uncomp" | "comp">> = {
  tpf1: "uncomp",
  dpf1: "uncomp",
  tpf2: "comp",
  dpf2: "comp",
};

export type MetricStat = {
  avg: number | null;
  min: number | null;
  max: number | null;
  n: number;
  /** 일반 항목은 값의 합. 역률이고 weight>0 이면 |pf|*|P| 의 합. */
  sum: number;
  weight: number;
};

export type SummaryPayload = {
  sampleCount: number;
  expectedCount: number;
  coverage: number;
  metrics: Partial<Record<ScalarMetric, MetricStat>>;
  arrayMetrics: Partial<Record<ArrayMetric, MetricStat[]>>;
  uncompEnergyKwh: number | null;
  compEnergyKwh: number | null;
  energyEstimated: boolean;
};

export type RawSample = {
  id: string;
  recordedAt: Date;
  receivedAt: Date | null;
  values: Partial<Record<ScalarMetric, number | null>>;
  arrays: Partial<Record<ArrayMetric, number[] | null>>;
};

export type HistoryPoint = {
  id: string;
  installationId: string;
  recordedAt: string;
  gap?: boolean;
  sampleCount?: number;
  expectedCount?: number;
  coverage?: number | null;
  /** 요약 구간의 최소. 10분 원본에는 없다. */
  metricMin?: Record<string, number | Array<number | null> | null>;
  /** 요약 구간의 최대. 10분 원본에는 없다. */
  metricMax?: Record<string, number | Array<number | null> | null>;
} & Partial<Record<ScalarMetric, number | null>> &
  Partial<Record<ArrayMetric, Array<number | null> | null>>;

export function emptyStat(): MetricStat {
  return { avg: null, min: null, max: null, n: 0, sum: 0, weight: 0 };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function acceptArrayValue(metric: ArrayMetric, value: number): boolean {
  if (metric === "areaTemp" && value <= -39.95) return false;
  if (metric === "moduleTemp" && value < 0) return false;
  return true;
}

export function dedupeSamples(rows: RawSample[]): RawSample[] {
  const byTime = new Map<number, RawSample>();
  for (const row of rows) {
    const key = row.recordedAt.getTime();
    const prev = byTime.get(key);
    if (!prev) {
      byTime.set(key, row);
      continue;
    }
    const prevRecv = prev.receivedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const nextRecv = row.receivedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (nextRecv > prevRecv || (nextRecv === prevRecv && row.id > prev.id)) {
      byTime.set(key, row);
    }
  }
  return [...byTime.values()].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
}

function powerWeight(sample: RawSample, side: "uncomp" | "comp"): number | undefined {
  const p = finite(side === "uncomp" ? sample.values.uncompP : sample.values.compP);
  if (p != null && Math.abs(p) > 0) return Math.abs(p);
  const s = finite(side === "uncomp" ? sample.values.uncompS : sample.values.compS);
  if (s != null && Math.abs(s) > 0) return Math.abs(s);
  return undefined;
}

/** 평균만 |PF|. 최소·최대는 진상/지상 부호를 남긴다. */
function powerFactorStat(values: number[], weights: Array<number | undefined>): MetricStat {
  const magnitude = statFromValues(
    values.map((value) => Math.abs(value)),
    weights,
  );
  const signed = statFromValues(values);
  return { ...magnitude, min: signed.min, max: signed.max };
}

export function statFromValues(
  values: number[],
  weights?: Array<number | undefined>,
): MetricStat {
  if (values.length === 0) return emptyStat();
  let min = Infinity;
  let max = -Infinity;
  let arith = 0;
  let weighted = 0;
  let weight = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    arith += v;
    const w = weights?.[i];
    if (w != null && w > 0) {
      weighted += v * w;
      weight += w;
    }
  }
  const useWeight = weight > 0;
  return {
    avg: useWeight ? weighted / weight : arith / values.length,
    min,
    max,
    n: values.length,
    sum: useWeight ? weighted : arith,
    weight,
  };
}

export function mergeStats(parts: Array<MetricStat | undefined>): MetricStat {
  let n = 0;
  let min = Infinity;
  let max = -Infinity;
  let weighted = 0;
  let weight = 0;
  let arith = 0;
  let arithN = 0;
  for (const part of parts) {
    if (!part || part.n <= 0 || part.avg == null || part.min == null || part.max == null) {
      continue;
    }
    n += part.n;
    if (part.min < min) min = part.min;
    if (part.max > max) max = part.max;
    if (part.weight > 0) {
      weighted += part.sum;
      weight += part.weight;
    } else {
      arith += part.sum;
      arithN += part.n;
    }
  }
  if (n === 0) return emptyStat();
  const useWeight = weight > 0;
  return {
    avg: useWeight ? weighted / weight : arith / arithN,
    min,
    max,
    n,
    sum: useWeight ? weighted : arith,
    weight,
  };
}

export function estimateEnergy(
  samples: RawSample[],
  intervalMs: number,
): { uncompEnergyKwh: number | null; compEnergyKwh: number | null } {
  let uncomp = 0;
  let comp = 0;
  let uncompN = 0;
  let compN = 0;
  const ordered = [...samples].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const next = ordered[i + 1];
    let dt = intervalMs;
    if (next) {
      const gap = next.recordedAt.getTime() - current.recordedAt.getTime();
      if (gap > 0 && gap <= intervalMs * 2) dt = gap;
    }
    const hours = dt / 3_600_000;
    const pBefore = finite(current.values.uncompP);
    const pAfter = finite(current.values.compP);
    if (pBefore != null) {
      uncomp += pBefore * hours;
      uncompN += 1;
    }
    if (pAfter != null) {
      comp += pAfter * hours;
      compN += 1;
    }
  }
  return {
    uncompEnergyKwh: uncompN > 0 ? uncomp : null,
    compEnergyKwh: compN > 0 ? comp : null,
  };
}

function coverageOf(sampleCount: number, expectedCount: number): number {
  if (expectedCount <= 0) return 0;
  return sampleCount / expectedCount;
}

export function aggregateSamples(
  samples: RawSample[],
  expectedCount: number,
  intervalMs: number,
): SummaryPayload | null {
  if (samples.length === 0) return null;
  const metrics: SummaryPayload["metrics"] = {};
  for (const key of SCALAR_METRICS) {
    const values: number[] = [];
    const weights: Array<number | undefined> = [];
    const side = PF_SIDE[key];
    for (const sample of samples) {
      const value = finite(sample.values[key]);
      if (value == null) continue;
      values.push(value);
      if (side) weights.push(powerWeight(sample, side));
    }
    const stat = side ? powerFactorStat(values, weights) : statFromValues(values);
    if (stat.n > 0) metrics[key] = stat;
  }

  const arrayMetrics: SummaryPayload["arrayMetrics"] = {};
  for (const key of ARRAY_METRICS) {
    let length = 0;
    for (const sample of samples) {
      const arr = sample.arrays[key];
      if (arr && arr.length > length) length = arr.length;
    }
    if (length === 0) continue;
    const stats: MetricStat[] = [];
    for (let index = 0; index < length; index += 1) {
      const values: number[] = [];
      for (const sample of samples) {
        const value = finite(sample.arrays[key]?.[index]);
        if (value == null || !acceptArrayValue(key, value)) continue;
        values.push(value);
      }
      stats.push(statFromValues(values));
    }
    arrayMetrics[key] = stats;
  }

  const energy = estimateEnergy(samples, intervalMs);
  return {
    sampleCount: samples.length,
    expectedCount,
    coverage: coverageOf(samples.length, expectedCount),
    metrics,
    arrayMetrics,
    uncompEnergyKwh: energy.uncompEnergyKwh,
    compEnergyKwh: energy.compEnergyKwh,
    energyEstimated: true,
  };
}

export function mergeSummaries(
  parts: SummaryPayload[],
  expectedCount: number,
): SummaryPayload | null {
  const present = parts.filter((part) => part.sampleCount > 0);
  if (present.length === 0) return null;
  const metrics: SummaryPayload["metrics"] = {};
  for (const key of SCALAR_METRICS) {
    const stat = mergeStats(present.map((part) => part.metrics[key]));
    if (stat.n > 0) metrics[key] = stat;
  }
  const arrayMetrics: SummaryPayload["arrayMetrics"] = {};
  for (const key of ARRAY_METRICS) {
    const length = Math.max(
      0,
      ...present.map((part) => part.arrayMetrics[key]?.length ?? 0),
    );
    if (length === 0) continue;
    const stats: MetricStat[] = [];
    for (let index = 0; index < length; index += 1) {
      stats.push(
        mergeStats(present.map((part) => part.arrayMetrics[key]?.[index])),
      );
    }
    arrayMetrics[key] = stats;
  }
  let uncomp: number | null = null;
  let comp: number | null = null;
  let sampleCount = 0;
  for (const part of present) {
    sampleCount += part.sampleCount;
    if (part.uncompEnergyKwh != null) uncomp = (uncomp ?? 0) + part.uncompEnergyKwh;
    if (part.compEnergyKwh != null) comp = (comp ?? 0) + part.compEnergyKwh;
  }
  return {
    sampleCount,
    expectedCount,
    coverage: coverageOf(sampleCount, expectedCount),
    metrics,
    arrayMetrics,
    uncompEnergyKwh: uncomp,
    compEnergyKwh: comp,
    energyEstimated: true,
  };
}

export function pickStat(
  stat: MetricStat | undefined,
  aggregation: HistoryAggregation,
): number | null {
  if (!stat || stat.n <= 0) return null;
  const value = stat[aggregation];
  return value == null || !Number.isFinite(value) ? null : value;
}

function pointFromPayload(
  installationId: string,
  at: Date,
  payload: SummaryPayload | null,
  aggregation: HistoryAggregation,
): HistoryPoint {
  if (!payload) {
    return {
      id: `${installationId}:${at.toISOString()}:gap`,
      installationId,
      recordedAt: at.toISOString(),
      gap: true,
    };
  }
  const point: HistoryPoint = {
    id: `${installationId}:${at.toISOString()}`,
    installationId,
    recordedAt: at.toISOString(),
    sampleCount: payload.sampleCount,
    expectedCount: payload.expectedCount,
    coverage: payload.coverage,
  };
  const metricMin: Record<string, number | Array<number | null> | null> = {};
  const metricMax: Record<string, number | Array<number | null> | null> = {};
  for (const key of SCALAR_METRICS) {
    point[key] = pickStat(payload.metrics[key], aggregation);
    const min = pickStat(payload.metrics[key], "min");
    const max = pickStat(payload.metrics[key], "max");
    if (min != null) metricMin[key] = min;
    if (max != null) metricMax[key] = max;
  }
  for (const key of ARRAY_METRICS) {
    const stats = payload.arrayMetrics[key];
    if (!stats) continue;
    point[key] = stats.map((stat) => pickStat(stat, aggregation));
    metricMin[key] = stats.map((stat) => pickStat(stat, "min"));
    metricMax[key] = stats.map((stat) => pickStat(stat, "max"));
  }
  point.metricMin = metricMin;
  point.metricMax = metricMax;
  return point;
}

function bucketStarts(
  from: Date,
  to: Date,
  resolution: "hourly" | "daily",
): Date[] {
  const out: Date[] = [];
  let cursor = resolution === "hourly" ? kstHourStart(from) : kstDayStart(from);
  for (; cursor.getTime() < to.getTime(); ) {
    out.push(cursor);
    cursor = resolution === "hourly" ? addHours(cursor, 1) : addDays(cursor, 1);
  }
  return out;
}

function groupSamples(
  samples: RawSample[],
  resolution: "hourly" | "daily",
): Map<number, RawSample[]> {
  const groups = new Map<number, RawSample[]>();
  for (const sample of samples) {
    const start =
      resolution === "hourly"
        ? kstHourStart(sample.recordedAt)
        : kstDayStart(sample.recordedAt);
    const key = start.getTime();
    const list = groups.get(key);
    if (list) list.push(sample);
    else groups.set(key, [sample]);
  }
  return groups;
}

export function insertRawGaps(points: HistoryPoint[], intervalMs: number): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (i > 0) {
      const prev = new Date(points[i - 1].recordedAt).getTime();
      const curr = new Date(point.recordedAt).getTime();
      if (curr - prev > intervalMs * 1.5) {
        const at = new Date(prev + intervalMs);
        out.push({
          id: `${point.installationId}:${at.toISOString()}:gap`,
          installationId: point.installationId,
          recordedAt: at.toISOString(),
          gap: true,
        });
      }
    }
    out.push(point);
  }
  return out;
}

export function buildHistoryFromSamples(args: {
  samples: RawSample[];
  installationId: string;
  resolution: HistoryResolution;
  aggregation: HistoryAggregation;
  from: Date;
  to: Date;
  intervalMs: number;
}): {
  points: HistoryPoint[];
  sampleCount: number;
  expectedCount: number;
  coverage: number | null;
  gapCount: number;
  energy: { uncompKwh: number | null; compKwh: number | null; estimated: true };
} {
  const samples = dedupeSamples(args.samples).filter((sample) => {
    const t = sample.recordedAt.getTime();
    return t >= args.from.getTime() && t < args.to.getTime();
  });
  const energy = estimateEnergy(samples, args.intervalMs);
  const perHour = Math.max(1, Math.round(3_600_000 / args.intervalMs));

  if (args.resolution === "raw") {
    const points = insertRawGaps(
      samples.map((sample) => {
        const point: HistoryPoint = {
          id: sample.id,
          installationId: args.installationId,
          recordedAt: sample.recordedAt.toISOString(),
          sampleCount: 1,
          expectedCount: 1,
          coverage: 1,
        };
        for (const key of SCALAR_METRICS) {
          const value = finite(sample.values[key]);
          if (value != null) point[key] = value;
        }
        for (const key of ARRAY_METRICS) {
          const arr = sample.arrays[key];
          if (arr) point[key] = arr;
        }
        return point;
      }),
      args.intervalMs,
    );
    const gapCount = points.filter((point) => point.gap).length;
    const expected = Math.max(1, Math.round((args.to.getTime() - args.from.getTime()) / args.intervalMs));
    return {
      points,
      sampleCount: samples.length,
      expectedCount: expected,
      coverage: samples.length === 0 ? null : coverageOf(samples.length, expected),
      gapCount,
      energy: {
        uncompKwh: energy.uncompEnergyKwh,
        compKwh: energy.compEnergyKwh,
        estimated: true,
      },
    };
  }

  const slots = bucketStarts(args.from, args.to, args.resolution);
  const groups = groupSamples(samples, args.resolution);
  const expectedPer = args.resolution === "hourly" ? perHour : perHour * 24;
  const points = slots.map((slot) => {
    const grouped = groups.get(slot.getTime()) ?? [];
    const payload = aggregateSamples(grouped, expectedPer, args.intervalMs);
    return pointFromPayload(args.installationId, slot, payload, args.aggregation);
  });
  const gapCount = points.filter((point) => point.gap).length;
  const expectedCount = slots.length * expectedPer;
  return {
    points,
    sampleCount: samples.length,
    expectedCount,
    coverage: slots.length === 0 ? null : coverageOf(samples.length, expectedCount),
    gapCount,
    energy: {
      uncompKwh: energy.uncompEnergyKwh,
      compKwh: energy.compEnergyKwh,
      estimated: true,
    },
  };
}

export function buildHistoryFromSummaries(args: {
  rows: Array<{ bucketStart: Date; payload: SummaryPayload }>;
  installationId: string;
  resolution: "hourly" | "daily";
  aggregation: HistoryAggregation;
  from: Date;
  to: Date;
  intervalMs: number;
}): {
  points: HistoryPoint[];
  sampleCount: number;
  expectedCount: number;
  coverage: number | null;
  gapCount: number;
  energy: { uncompKwh: number | null; compKwh: number | null; estimated: true };
} {
  const byTime = new Map<number, SummaryPayload>();
  for (const row of args.rows) byTime.set(row.bucketStart.getTime(), row.payload);
  const slots = bucketStarts(args.from, args.to, args.resolution);
  const points = slots.map((slot) =>
    pointFromPayload(
      args.installationId,
      slot,
      byTime.get(slot.getTime()) ?? null,
      args.aggregation,
    ),
  );
  let sampleCount = 0;
  let uncomp: number | null = null;
  let comp: number | null = null;
  for (const payload of byTime.values()) {
    sampleCount += payload.sampleCount;
    if (payload.uncompEnergyKwh != null) uncomp = (uncomp ?? 0) + payload.uncompEnergyKwh;
    if (payload.compEnergyKwh != null) comp = (comp ?? 0) + payload.compEnergyKwh;
  }
  const perHour = Math.max(1, Math.round(3_600_000 / args.intervalMs));
  const expectedPer = args.resolution === "hourly" ? perHour : perHour * 24;
  const expectedCount = slots.length * expectedPer;
  return {
    points,
    sampleCount,
    expectedCount,
    coverage: slots.length === 0 ? null : coverageOf(sampleCount, expectedCount),
    gapCount: points.filter((point) => point.gap).length,
    energy: { uncompKwh: uncomp, compKwh: comp, estimated: true },
  };
}

export type PurgeBlockReason =
  | "missingHourly"
  | "countMismatch"
  | "staleSummary"
  | "missingDaily"
  | "staleDaily";

export function hourEligibleForPurge(input: {
  rawSampleCount: number;
  hourlySampleCount: number | null;
  hourlyUpdatedAt: Date | null;
  latestRawAt: Date;
  dailyUpdatedAt: Date | null;
}): { ok: true } | { ok: false; reason: PurgeBlockReason } {
  if (input.hourlySampleCount == null || input.hourlyUpdatedAt == null) {
    return { ok: false, reason: "missingHourly" };
  }
  if (input.hourlySampleCount !== input.rawSampleCount) {
    return { ok: false, reason: "countMismatch" };
  }
  if (input.hourlyUpdatedAt.getTime() < input.latestRawAt.getTime()) {
    return { ok: false, reason: "staleSummary" };
  }
  if (input.dailyUpdatedAt == null) {
    return { ok: false, reason: "missingDaily" };
  }
  if (input.dailyUpdatedAt.getTime() < input.hourlyUpdatedAt.getTime()) {
    return { ok: false, reason: "staleDaily" };
  }
  return { ok: true };
}
