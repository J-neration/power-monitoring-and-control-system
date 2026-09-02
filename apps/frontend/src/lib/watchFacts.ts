import { isCommLost } from "./commStatus";

export type MetricStats = {
  min: number | null;
  max: number | null;
  avg: number | null;
};

export type WatchReading = {
  recordedAt: Date | string;
  vL1?: number | null;
  vL2?: number | null;
  vL3?: number | null;
  tpf1?: number | null;
  tpf2?: number | null;
  dpf1?: number | null;
  dpf2?: number | null;
  loadCurrentTHDL1?: number | null;
  loadCurrentTHDL2?: number | null;
  loadCurrentTHDL3?: number | null;
  gridCurrentTHDL1?: number | null;
  gridCurrentTHDL2?: number | null;
  gridCurrentTHDL3?: number | null;
  uncompP?: number | null;
  compP?: number | null;
  uncompQ?: number | null;
  compQ?: number | null;
  areaTemp?: number[] | null;
  moduleTemp?: number[] | null;
  totalCapacity?: number | null;
  operatingCapacity?: number | null;
  reactivePowerCapacity?: number | null;
  availableMargin?: number | null;
};

export type WatchFacts = {
  installationId: string;
  hours: number;
  sampleCount: number;
  windowStart: string | null;
  windowEnd: string | null;
  commLost: boolean;
  lastSeenAt: string | null;
  pf: {
    tpfBefore: MetricStats;
    tpfAfter: MetricStats;
    dpfBefore: MetricStats;
    dpfAfter: MetricStats;
  };
  thd: {
    loadL1: MetricStats;
    loadL2: MetricStats;
    loadL3: MetricStats;
    gridL1: MetricStats;
    gridL2: MetricStats;
    gridL3: MetricStats;
    loadMax: number | null;
    gridMax: number | null;
  };
  voltage: {
    l1: MetricStats;
    l2: MetricStats;
    l3: MetricStats;
    unbalanceAvg: number | null;
    unbalanceMax: number | null;
  };
  power: {
    pBefore: MetricStats;
    pAfter: MetricStats;
    qBefore: MetricStats;
    qAfter: MetricStats;
  };
  thermal: {
    areaAvg: number | null;
    areaMax: number | null;
    moduleAvg: number | null;
    moduleMax: number | null;
  };
  capacity: {
    total: number | null;
    operatingAvg: number | null;
    reactiveAvg: number | null;
    marginMin: number | null;
  };
};

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function round(v: number | null, decimals = 1): number | null {
  if (v == null) return null;
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}

function stats(values: Array<number | null | undefined>, decimals = 1): MetricStats {
  const xs = values.map(num).filter((v): v is number => v != null);
  if (!xs.length) {
    return { min: null, max: null, avg: null };
  }
  const sum = xs.reduce((a, b) => a + b, 0);
  return {
    min: round(Math.min(...xs), decimals),
    max: round(Math.max(...xs), decimals),
    avg: round(sum / xs.length, decimals),
  };
}

function flatten(arrays: Array<number[] | null | undefined>): number[] {
  const out: number[] = [];
  for (const arr of arrays) {
    if (!arr) continue;
    for (const v of arr) {
      if (Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function maxOf(xs: number[]): number | null {
  return xs.length ? Math.max(...xs) : null;
}

function minOf(xs: number[]): number | null {
  return xs.length ? Math.min(...xs) : null;
}

/** NEMA MG-1 / IEEE 141 LVUR% */
function phaseUnbalancePct(
  v1?: number | null,
  v2?: number | null,
  v3?: number | null,
): number | null {
  const xs = [v1, v2, v3].map(num).filter((v): v is number => v != null && v > 0);
  if (xs.length < 3) return null;
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (avg <= 0) return null;
  const maxDev = Math.max(...xs.map((v) => Math.abs(v - avg)));
  return (maxDev / avg) * 100;
}

function iso(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function buildWatchFacts(input: {
  installationId: string;
  hours: number;
  lastSeenAt?: Date | string | null;
  readings: WatchReading[];
  now?: number;
}): WatchFacts {
  const readings = [...input.readings].sort((a, b) => {
    const ta = new Date(a.recordedAt).getTime();
    const tb = new Date(b.recordedAt).getTime();
    return ta - tb;
  });

  const first = readings[0] ?? null;
  const last = readings[readings.length - 1] ?? null;
  const unbalance = readings
    .map((r) => phaseUnbalancePct(r.vL1, r.vL2, r.vL3))
    .filter((v): v is number => v != null);

  const area = flatten(readings.map((r) => r.areaTemp));
  const module = flatten(readings.map((r) => r.moduleTemp));
  const totals = readings.map((r) => num(r.totalCapacity)).filter((v): v is number => v != null);
  const operating = readings
    .map((r) => num(r.operatingCapacity))
    .filter((v): v is number => v != null);
  const reactive = readings
    .map((r) => num(r.reactivePowerCapacity))
    .filter((v): v is number => v != null);
  const margin = readings
    .map((r) => num(r.availableMargin))
    .filter((v): v is number => v != null);

  const loadThd = stats([
    ...readings.map((r) => r.loadCurrentTHDL1),
    ...readings.map((r) => r.loadCurrentTHDL2),
    ...readings.map((r) => r.loadCurrentTHDL3),
  ]);
  const gridThd = stats([
    ...readings.map((r) => r.gridCurrentTHDL1),
    ...readings.map((r) => r.gridCurrentTHDL2),
    ...readings.map((r) => r.gridCurrentTHDL3),
  ]);

  return {
    installationId: input.installationId,
    hours: input.hours,
    sampleCount: readings.length,
    windowStart: first ? iso(first.recordedAt) : null,
    windowEnd: last ? iso(last.recordedAt) : null,
    commLost: isCommLost(input.lastSeenAt, input.now),
    lastSeenAt: iso(input.lastSeenAt),
    pf: {
      tpfBefore: stats(readings.map((r) => r.tpf1)),
      tpfAfter: stats(readings.map((r) => r.tpf2)),
      dpfBefore: stats(readings.map((r) => r.dpf1)),
      dpfAfter: stats(readings.map((r) => r.dpf2)),
    },
    thd: {
      loadL1: stats(readings.map((r) => r.loadCurrentTHDL1)),
      loadL2: stats(readings.map((r) => r.loadCurrentTHDL2)),
      loadL3: stats(readings.map((r) => r.loadCurrentTHDL3)),
      gridL1: stats(readings.map((r) => r.gridCurrentTHDL1)),
      gridL2: stats(readings.map((r) => r.gridCurrentTHDL2)),
      gridL3: stats(readings.map((r) => r.gridCurrentTHDL3)),
      loadMax: loadThd.max,
      gridMax: gridThd.max,
    },
    voltage: {
      l1: stats(readings.map((r) => r.vL1)),
      l2: stats(readings.map((r) => r.vL2)),
      l3: stats(readings.map((r) => r.vL3)),
      unbalanceAvg: round(mean(unbalance)),
      unbalanceMax: round(maxOf(unbalance)),
    },
    power: {
      pBefore: stats(readings.map((r) => r.uncompP), 0),
      pAfter: stats(readings.map((r) => r.compP), 0),
      qBefore: stats(readings.map((r) => r.uncompQ), 0),
      qAfter: stats(readings.map((r) => r.compQ), 0),
    },
    thermal: {
      areaAvg: round(mean(area)),
      areaMax: round(maxOf(area)),
      moduleAvg: round(mean(module)),
      moduleMax: round(maxOf(module)),
    },
    capacity: {
      total: round(mean(totals), 0),
      operatingAvg: round(mean(operating), 1),
      reactiveAvg: round(mean(reactive), 1),
      marginMin: round(minOf(margin), 1),
    },
  };
}
