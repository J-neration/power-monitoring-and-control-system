import { isCommLost } from "./commStatus.js";
import { WATCH_THRESHOLDS as T } from "./watchThresholds.js";

export type MetricStats = {
  min: number | null;
  max: number | null;
  avg: number | null;
  minAt: string | null;
  maxAt: string | null;
  /** signed sample with the smallest |value| (역률은 0에 가까울수록 나쁨) */
  minMagSigned: number | null;
  minMagAt: string | null;
};

export type WatchReading = {
  recordedAt: Date | string;
  moduleStatus?: number[] | null;
  numOfMods?: number | null;
  vL1?: number | null;
  vL2?: number | null;
  vL3?: number | null;
  gridCurrentL1?: number | null;
  gridCurrentL2?: number | null;
  gridCurrentL3?: number | null;
  loadCurrentL1?: number | null;
  loadCurrentL2?: number | null;
  loadCurrentL3?: number | null;
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
  fanSpeed?: number[] | null;
  totalCapacity?: number | null;
  operatingCapacity?: number | null;
  reactivePowerCapacity?: number | null;
  availableMargin?: number | null;
};

/** THD·역률 판정에 쓸 수 있는 샘플이 얼마나 남았는지 */
export type LoadGateFacts = {
  /** 창 내 최대 상전류(A). 전류를 한 번도 못 받았으면 null */
  maxCurrent: number | null;
  /** 경부하·정지로 THD·역률 판정에서 뺀 샘플 수 */
  skippedSampleCount: number;
  /** THD·역률 판정에 쓴 샘플 수 */
  judgedSampleCount: number;
};

/** 보상 전 → 보상 후. PAF가 실제로 일을 하고 있는지 */
export type CompensationFacts = {
  /** 부하측(보상 전) 최악상 THD 평균 */
  thdBefore: number | null;
  /** 계통측(보상 후) 최악상 THD 평균 */
  thdAfter: number | null;
  /** 저감률 0~1. 음수면 계통측이 더 나쁘다 */
  thdReduction: number | null;
  thdSampleCount: number;
  /** 종합역률 절댓값 평균 */
  tpfBefore: number | null;
  tpfAfter: number | null;
  /** 개선폭 (%p) */
  tpfGain: number | null;
  tpfSampleCount: number;
};

/** 최신 수신 기준 모듈 상태. moduleStatus를 한 번도 못 받았으면 total = null */
export type ModuleFacts = {
  total: number | null;
  running: number;
  fault: number;
  offline: number;
  at: string | null;
};

/** 최신 수신 기준 냉각팬. fanSpeed를 한 번도 못 받았으면 total = null */
export type FanFacts = {
  total: number | null;
  stopped: number;
  min: number | null;
  /** 그 시각에 모듈이 돌고 있었는지. 정지 중이면 팬이 멈춘 게 정상 */
  whileRunning: boolean;
  at: string | null;
};

export type WatchFacts = {
  installationId: string;
  hours: number;
  sampleCount: number;
  windowStart: string | null;
  windowEnd: string | null;
  commLost: boolean;
  lastSeenAt: string | null;
  load: LoadGateFacts;
  /** 아래 pf·thd는 경부하·정지 샘플을 뺀 값이다 */
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
    loadMaxAt: string | null;
    gridMax: number | null;
    gridMaxAt: string | null;
  };
  compensation: CompensationFacts;
  voltage: {
    l1: MetricStats;
    l2: MetricStats;
    l3: MetricStats;
    unbalanceAvg: number | null;
    unbalanceMax: number | null;
    unbalanceMaxAt: string | null;
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
    areaMaxAt: string | null;
    moduleAvg: number | null;
    moduleMax: number | null;
    moduleMaxAt: string | null;
    /** 같은 시각 운전 모듈 간 온도 편차의 창 내 최대 */
    moduleSpreadMax: number | null;
    moduleSpreadMaxAt: string | null;
  };
  modules: ModuleFacts;
  fan: FanFacts;
  capacity: {
    total: number | null;
    operatingAvg: number | null;
    reactiveAvg: number | null;
    marginMin: number | null;
    /** 운전 용량 / 총 용량의 창 내 최대 */
    operatingRatioMax: number | null;
    operatingRatioMaxAt: string | null;
    saturatedSampleCount: number;
  };
};

type Sample = { value: number; at: string };

/** HMI moduleStatus: 0 standby · 1 start · 2 running · 3 fault · 4 offline */
const RUNNING_MODULE_STATUS = new Set([1, 2]);
const FAULT_MODULE_STATUS = 3;
const OFFLINE_MODULE_STATUS = 4;
/** 주위온도 -40°C = 센서 미부착 */
const AREA_TEMP_FLOOR = -39.5;

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function round(v: number | null, decimals = 1): number | null {
  if (v == null) return null;
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}

function iso(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function emptyStats(): MetricStats {
  return {
    min: null,
    max: null,
    avg: null,
    minAt: null,
    maxAt: null,
    minMagSigned: null,
    minMagAt: null,
  };
}

function statsFromSamples(samples: Sample[], decimals = 1): MetricStats {
  if (!samples.length) return emptyStats();
  let minS = samples[0];
  let maxS = samples[0];
  let magS = samples[0];
  let sum = 0;
  for (const s of samples) {
    sum += s.value;
    if (s.value < minS.value) minS = s;
    if (s.value > maxS.value) maxS = s;
    if (Math.abs(s.value) < Math.abs(magS.value)) magS = s;
  }
  return {
    min: round(minS.value, decimals),
    max: round(maxS.value, decimals),
    avg: round(sum / samples.length, decimals),
    minAt: minS.at,
    maxAt: maxS.at,
    minMagSigned: round(magS.value, decimals),
    minMagAt: magS.at,
  };
}

function fieldSamples(
  readings: WatchReading[],
  pick: (r: WatchReading) => number | null | undefined,
): Sample[] {
  const out: Sample[] = [];
  for (const r of readings) {
    const v = num(pick(r));
    const at = iso(r.recordedAt);
    if (v == null || !at) continue;
    out.push({ value: v, at });
  }
  return out;
}

function fieldStats(
  readings: WatchReading[],
  pick: (r: WatchReading) => number | null | undefined,
  decimals = 1,
): MetricStats {
  return statsFromSamples(fieldSamples(readings, pick), decimals);
}

/** 0 근처 역률은 계측값이 아니라 미계측이다 */
function pfStats(
  readings: WatchReading[],
  pick: (r: WatchReading) => number | null | undefined,
): MetricStats {
  return statsFromSamples(
    fieldSamples(readings, pick).filter(
      (s) => Math.abs(s.value) >= T.pfValidMinMag,
    ),
  );
}

function mergedMax(statsList: MetricStats[]): { value: number | null; at: string | null } {
  let value: number | null = null;
  let at: string | null = null;
  for (const s of statsList) {
    if (s.max == null) continue;
    if (value == null || s.max > value) {
      value = s.max;
      at = s.maxAt;
    }
  }
  return { value, at };
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function minOf(xs: number[]): number | null {
  return xs.length ? Math.min(...xs) : null;
}

function maxOf(vs: Array<number | null | undefined>): number | null {
  const xs = vs.map(num).filter((v): v is number => v != null);
  return xs.length ? Math.max(...xs) : null;
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

function arraySamples(
  readings: WatchReading[],
  pick: (r: WatchReading) => number[] | null | undefined,
): Sample[] {
  const out: Sample[] = [];
  for (const r of readings) {
    const at = iso(r.recordedAt);
    if (!at) continue;
    for (const raw of pick(r) ?? []) {
      if (!Number.isFinite(raw)) continue;
      out.push({ value: raw, at });
    }
  }
  return out;
}

/** 3상 중 최대 전류. 전류를 하나도 못 받았으면 null */
function maxPhaseCurrent(r: WatchReading): number | null {
  return maxOf([
    r.gridCurrentL1,
    r.gridCurrentL2,
    r.gridCurrentL3,
    r.loadCurrentL1,
    r.loadCurrentL2,
    r.loadCurrentL3,
  ]);
}

/** true 운전 중 · false 전부 정지 · null moduleStatus 미수신 */
function anyModuleRunning(r: WatchReading): boolean | null {
  const st = r.moduleStatus;
  if (!Array.isArray(st) || st.length === 0) return null;
  return st.some((s) => RUNNING_MODULE_STATUS.has(s));
}

/**
 * THD-i는 기본파 전류가 분모라 경부하에서 값이 폭발하고, PAF가 정지 중이면
 * 계통측 THD·역률을 장비 탓으로 볼 수 없다. 두 구간을 판정 대상에서 뺀다.
 * 전류·모듈상태를 못 받은 샘플은 남긴다 — 모르는 것과 나쁜 것은 다르다.
 */
function gateByLoad(readings: WatchReading[]): {
  judged: WatchReading[];
  maxCurrent: number | null;
} {
  const currents = readings
    .map(maxPhaseCurrent)
    .filter((v): v is number => v != null);
  const maxCurrent = currents.length ? Math.max(...currents) : null;
  const floor =
    maxCurrent == null
      ? null
      : Math.max(T.loadGateMinCurrent, maxCurrent * T.loadGateMinRatio);

  const judged = readings.filter((r) => {
    if (anyModuleRunning(r) === false) return false;
    if (floor == null) return true;
    const i = maxPhaseCurrent(r);
    return i == null || i >= floor;
  });
  return { judged, maxCurrent: round(maxCurrent) };
}

function buildCompensation(readings: WatchReading[]): CompensationFacts {
  const thdBefore: number[] = [];
  const thdAfter: number[] = [];
  const pfBefore: number[] = [];
  const pfAfter: number[] = [];

  for (const r of readings) {
    const tb = maxOf([r.loadCurrentTHDL1, r.loadCurrentTHDL2, r.loadCurrentTHDL3]);
    const ta = maxOf([r.gridCurrentTHDL1, r.gridCurrentTHDL2, r.gridCurrentTHDL3]);
    if (tb != null && ta != null && tb > 0) {
      thdBefore.push(tb);
      thdAfter.push(ta);
    }

    const pb = num(r.tpf1);
    const pa = num(r.tpf2);
    if (
      pb != null &&
      pa != null &&
      Math.abs(pb) >= T.pfValidMinMag &&
      Math.abs(pa) >= T.pfValidMinMag
    ) {
      pfBefore.push(Math.abs(pb));
      pfAfter.push(Math.abs(pa));
    }
  }

  const tbMean = mean(thdBefore);
  const taMean = mean(thdAfter);
  const pbMean = mean(pfBefore);
  const paMean = mean(pfAfter);

  return {
    thdBefore: round(tbMean),
    thdAfter: round(taMean),
    thdReduction:
      tbMean != null && taMean != null && tbMean > 0
        ? round((tbMean - taMean) / tbMean, 3)
        : null,
    thdSampleCount: thdBefore.length,
    tpfBefore: round(pbMean),
    tpfAfter: round(paMean),
    tpfGain: pbMean != null && paMean != null ? round(paMean - pbMean) : null,
    tpfSampleCount: pfBefore.length,
  };
}

function buildModuleFacts(readings: WatchReading[]): ModuleFacts {
  for (let i = readings.length - 1; i >= 0; i -= 1) {
    const r = readings[i];
    const st = r.moduleStatus;
    if (!Array.isArray(st) || st.length === 0) continue;
    return {
      total: num(r.numOfMods) ?? st.length,
      running: st.filter((s) => RUNNING_MODULE_STATUS.has(s)).length,
      fault: st.filter((s) => s === FAULT_MODULE_STATUS).length,
      offline: st.filter((s) => s === OFFLINE_MODULE_STATUS).length,
      at: iso(r.recordedAt),
    };
  }
  return { total: null, running: 0, fault: 0, offline: 0, at: null };
}

function buildFanFacts(readings: WatchReading[]): FanFacts {
  for (let i = readings.length - 1; i >= 0; i -= 1) {
    const r = readings[i];
    const fans = (r.fanSpeed ?? []).filter((v) => Number.isFinite(v));
    if (!fans.length) continue;
    return {
      total: fans.length,
      stopped: fans.filter((v) => v <= T.fanStopped).length,
      min: round(Math.min(...fans)),
      whileRunning: anyModuleRunning(r) !== false,
      at: iso(r.recordedAt),
    };
  }
  return { total: null, stopped: 0, min: null, whileRunning: false, at: null };
}

/** 같은 시각 모듈 간 온도 차. 정지 모듈은 식어 있으므로 운전 모듈만 비교한다 */
function moduleSpreadSamples(readings: WatchReading[]): Sample[] {
  const out: Sample[] = [];
  for (const r of readings) {
    const at = iso(r.recordedAt);
    if (!at) continue;
    const temps = r.moduleTemp ?? [];
    const status = Array.isArray(r.moduleStatus) ? r.moduleStatus : null;
    const usable = temps.filter(
      (v, i) =>
        Number.isFinite(v) &&
        (status == null ||
          status.length !== temps.length ||
          RUNNING_MODULE_STATUS.has(status[i])),
    );
    if (usable.length < 2) continue;
    out.push({ value: Math.max(...usable) - Math.min(...usable), at });
  }
  return out;
}

function operatingRatioSamples(readings: WatchReading[]): Sample[] {
  const out: Sample[] = [];
  for (const r of readings) {
    const at = iso(r.recordedAt);
    const total = num(r.totalCapacity);
    const op = num(r.operatingCapacity);
    if (!at || total == null || total <= 0 || op == null) continue;
    out.push({ value: op / total, at });
  }
  return out;
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

  const { judged, maxCurrent } = gateByLoad(readings);

  const unbalanceSamples = fieldSamples(readings, (r) =>
    phaseUnbalancePct(r.vL1, r.vL2, r.vL3),
  );
  const unbalanceStats = statsFromSamples(unbalanceSamples);
  const areaSamples = arraySamples(readings, (r) => r.areaTemp).filter(
    (s) => s.value > AREA_TEMP_FLOOR,
  );
  const moduleSamples = arraySamples(readings, (r) => r.moduleTemp);
  const areaStats = statsFromSamples(areaSamples);
  const moduleStats = statsFromSamples(moduleSamples);
  const spreadStats = statsFromSamples(moduleSpreadSamples(readings));

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
  const opRatios = operatingRatioSamples(readings);
  const opRatioStats = statsFromSamples(opRatios, 3);

  const loadL1 = fieldStats(judged, (r) => r.loadCurrentTHDL1);
  const loadL2 = fieldStats(judged, (r) => r.loadCurrentTHDL2);
  const loadL3 = fieldStats(judged, (r) => r.loadCurrentTHDL3);
  const gridL1 = fieldStats(judged, (r) => r.gridCurrentTHDL1);
  const gridL2 = fieldStats(judged, (r) => r.gridCurrentTHDL2);
  const gridL3 = fieldStats(judged, (r) => r.gridCurrentTHDL3);
  const loadMax = mergedMax([loadL1, loadL2, loadL3]);
  const gridMax = mergedMax([gridL1, gridL2, gridL3]);

  return {
    installationId: input.installationId,
    hours: input.hours,
    sampleCount: readings.length,
    windowStart: first ? iso(first.recordedAt) : null,
    windowEnd: last ? iso(last.recordedAt) : null,
    commLost: isCommLost(input.lastSeenAt, input.now),
    lastSeenAt: iso(input.lastSeenAt),
    load: {
      maxCurrent,
      skippedSampleCount: readings.length - judged.length,
      judgedSampleCount: judged.length,
    },
    pf: {
      tpfBefore: pfStats(judged, (r) => r.tpf1),
      tpfAfter: pfStats(judged, (r) => r.tpf2),
      dpfBefore: pfStats(judged, (r) => r.dpf1),
      dpfAfter: pfStats(judged, (r) => r.dpf2),
    },
    thd: {
      loadL1,
      loadL2,
      loadL3,
      gridL1,
      gridL2,
      gridL3,
      loadMax: loadMax.value,
      loadMaxAt: loadMax.at,
      gridMax: gridMax.value,
      gridMaxAt: gridMax.at,
    },
    compensation: buildCompensation(judged),
    voltage: {
      l1: fieldStats(readings, (r) => r.vL1),
      l2: fieldStats(readings, (r) => r.vL2),
      l3: fieldStats(readings, (r) => r.vL3),
      unbalanceAvg: round(mean(unbalanceSamples.map((s) => s.value))),
      unbalanceMax: unbalanceStats.max,
      unbalanceMaxAt: unbalanceStats.maxAt,
    },
    power: {
      pBefore: fieldStats(readings, (r) => r.uncompP, 0),
      pAfter: fieldStats(readings, (r) => r.compP, 0),
      qBefore: fieldStats(readings, (r) => r.uncompQ, 0),
      qAfter: fieldStats(readings, (r) => r.compQ, 0),
    },
    thermal: {
      areaAvg: areaStats.avg,
      areaMax: areaStats.max,
      areaMaxAt: areaStats.maxAt,
      moduleAvg: moduleStats.avg,
      moduleMax: moduleStats.max,
      moduleMaxAt: moduleStats.maxAt,
      moduleSpreadMax: spreadStats.max,
      moduleSpreadMaxAt: spreadStats.maxAt,
    },
    modules: buildModuleFacts(readings),
    fan: buildFanFacts(readings),
    capacity: {
      total: round(mean(totals), 0),
      operatingAvg: round(mean(operating), 1),
      reactiveAvg: round(mean(reactive), 1),
      marginMin: round(minOf(margin), 1),
      operatingRatioMax: opRatioStats.max,
      operatingRatioMaxAt: opRatioStats.maxAt,
      saturatedSampleCount: opRatios.filter(
        (s) => s.value >= T.capacitySaturatedRatio,
      ).length,
    },
  };
}
