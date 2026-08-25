/**
 * 운용 절감 환산 — 전기 문외한용 숫자.
 *
 * 산출은 보상 전(Load) vs 보상 후(Grid) 계측으로 한다.
 * 연간 값은 "지금 이 운전이 1년 이어진다"는 환산이며, 계약전력·실측
 * 전력량계가 아니므로 화면 각주에 기준을 밝힌다.
 */

export const OPS_SAVINGS = {
  /** 기후에너지환경부 2025.12 공표, 2023년 소비단 전력배출계수 (tCO₂eq/MWh = kgCO₂eq/kWh) */
  co2KgPerKwh: 0.4173,
  /** 산업용(을) 고압A 중간부하 근사 (원/kWh). 시간대·선택요금에 따라 다름 */
  krwPerKwh: 160,
  /** 산업용(을) 고압A 기본요금 근사 (원/kW·월). 선택 I/II에 따라 다름 */
  demandKrwPerKwMonth: 8320,
  /** 변압기+선로 동손 비율 (미보상 전류 기준, 가정치) */
  copperLossRatio: 0.03,
  /** 소나무류 1그루 연간 CO₂ 흡수량 (kg) — 국립산림과학원 표준 */
  treeKgCo2PerYear: 6.6,
  hoursPerYear: 8760,
} as const;

/**
 * 품질 점수에 쓰는 한도와 출처.
 * IEEE 519는 고조파만 다룬다. 역률·불평형은 다른 규격이다.
 */
export const QUALITY_REFS = {
  weights: { pf: 0.4, thd: 0.4, unbalance: 0.2 },
  /** IEEE 519-2022 Table 2, 120 V–69 kV, Isc/IL 20–50 → 전류 TDD 8% */
  thdLimitPct: 8,
  /** IEC 61000-2-2 / EN 50160 저압 전압 불평형 양립 레벨 */
  voltageUnbalanceLimitPct: 2,
  /** NEMA MG-1 전동기 권장 전압 불평형 */
  voltageUnbalanceMotorPct: 1,
  /** 한전 전기공급약관 역률 기준(할증) / 인센티브 상한 */
  kepcoPfPct: 90,
  kepcoPfIncentivePct: 95,
} as const;

export type PowerSnapshot = {
  uncompP?: number | null;
  compP?: number | null;
  uncompS?: number | null;
  compS?: number | null;
  uncompQ?: number | null;
  compQ?: number | null;
  loadCurrentL1?: number | null;
  loadCurrentL2?: number | null;
  loadCurrentL3?: number | null;
  gridCurrentL1?: number | null;
  gridCurrentL2?: number | null;
  gridCurrentL3?: number | null;
  loadCurrentTHDL1?: number | null;
  loadCurrentTHDL2?: number | null;
  loadCurrentTHDL3?: number | null;
  gridCurrentTHDL1?: number | null;
  gridCurrentTHDL2?: number | null;
  gridCurrentTHDL3?: number | null;
  tpf1?: number | null;
  tpf2?: number | null;
  vL1?: number | null;
  vL2?: number | null;
  vL3?: number | null;
};

export type TimedReading = PowerSnapshot & { recordedAt: string };

export type OpsSavings = {
  kwSaved: number | null;
  kWhYear: number | null;
  kWhWindow: number | null;
  windowHours: number | null;
  carbonKgYear: number | null;
  treesYear: number | null;
  energyCostYear: number | null;
  pfCostYear: number | null;
  costYear: number | null;
  qReducedPct: number | null;
  pfBefore: number | null;
  pfAfter: number | null;
  sFreedKva: number | null;
  qualityBefore: number | null;
  qualityAfter: number | null;
  qualityThd: number | null;
  qualityUnbalance: number | null;
};

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function avg(
  values: Array<number | null | undefined>,
): number | null {
  const xs = values.map(num).filter((v): v is number => v != null);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 한전 역률요금 가감 비율. 양수=가산, 음수=감액. 역률은 0–100%.
 * 시행세칙: 매 1%당 기본요금의 0.2%. 본 환산은 개정 전 지상 90% / 감액 상한 95%를 사용.
 */
export function pfChargeRatio(tpfPct: number): number {
  const pf = Math.abs(tpfPct);
  const perPoint = 0.002;
  if (pf < 90) return (90 - pf) * perPoint;
  return -Math.min(pf - 90, 5) * perPoint;
}

/**
 * 순시 kW 절감: 유효전력 감소 + 전류 감소에 따른 I²R 동손.
 * 고조파 전류 감소분은 I_grid < I_load 에 이미 포함되므로 따로 더하지 않는다.
 */
export function estimateKwSaved(s: PowerSnapshot): number | null {
  const pBefore = num(s.uncompP);
  const pAfter = num(s.compP);
  const iLoad = avg([s.loadCurrentL1, s.loadCurrentL2, s.loadCurrentL3]);
  const iGrid = avg([s.gridCurrentL1, s.gridCurrentL2, s.gridCurrentL3]);
  const v = avg([s.vL1, s.vL2, s.vL3]);
  const sBefore = num(s.uncompS);
  const sAfter = num(s.compS);

  let kw = 0;
  let has = false;

  if (pBefore != null && pAfter != null && pBefore > pAfter) {
    kw += pBefore - pAfter;
    has = true;
  }

  const pBase =
    pBefore ??
    (v != null && iLoad != null ? (Math.sqrt(3) * v * iLoad) / 1000 : null);

  if (
    pBase != null &&
    pBase > 0 &&
    iLoad != null &&
    iLoad > 0 &&
    iGrid != null &&
    iGrid >= 0 &&
    iGrid < iLoad
  ) {
    const ratio = iGrid / iLoad;
    kw += pBase * OPS_SAVINGS.copperLossRatio * (1 - ratio * ratio);
    has = true;
  } else if (
    sBefore != null &&
    sAfter != null &&
    sBefore > sAfter &&
    sBefore > 0
  ) {
    kw += (sBefore - sAfter) * OPS_SAVINGS.copperLossRatio;
    has = true;
  }

  return has ? kw : null;
}

/**
 * NEMA MG-1 / IEEE 141 선간(상) 전압 불평형.
 * LVUR% = max|Vφ − Vavg| / Vavg × 100
 * (IEC VUF = V2/V1 과는 근사적으로 같으나 정의는 다름)
 */
export function phaseUnbalancePct(
  v1?: number | null,
  v2?: number | null,
  v3?: number | null,
): number | null {
  const xs = [v1, v2, v3].map(num).filter((v): v is number => v != null && v > 0);
  if (xs.length < 3) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return null;
  const maxDev = Math.max(...xs.map((v) => Math.abs(v - mean)));
  return (maxDev / mean) * 100;
}

/**
 * 한전 전기공급약관 역률 구간.
 * IEEE 한도가 아님 — 90% 미만 할증, 90–95% 인센티브.
 */
function pfQuality(tpfPct: number | null): number | null {
  if (tpfPct == null) return null;
  const pf = Math.abs(tpfPct);
  if (pf >= QUALITY_REFS.kepcoPfIncentivePct) return 100;
  if (pf >= QUALITY_REFS.kepcoPfPct) {
    return 82 + ((pf - QUALITY_REFS.kepcoPfPct) / 5) * 18;
  }
  if (pf >= 70) return 40 + ((pf - 70) / 20) * 42;
  return Math.max(0, (pf / 70) * 40);
}

/**
 * IEEE Std 519-2022 Table 2 전류왜곡 한도에 맞춘 점수.
 * Isc/IL 미지정이라 20–50 구간의 TDD 8%를 채택 한도로 둔다.
 * 5%(최엄격) 이내 100–90점, 8%에서 80점, 20%(표의 최대 한도)에서 25점.
 */
function thdQuality(thdPct: number | null): number | null {
  if (thdPct == null) return null;
  const thd = Math.max(0, thdPct);
  if (thd <= 5) return 100 - (thd / 5) * 10;
  if (thd <= 8) return 90 - ((thd - 5) / 3) * 10;
  if (thd <= 12) return 80 - ((thd - 8) / 4) * 20;
  if (thd <= 15) return 60 - ((thd - 12) / 3) * 15;
  if (thd <= 20) return 45 - ((thd - 15) / 5) * 20;
  return Math.max(0, 25 - (thd - 20) * 1.25);
}

/**
 * 전압 불평형 점수.
 * 1%: NEMA MG-1 전동기 권장 → 90점
 * 2%: IEC 61000-2-2 / EN 50160 양립 레벨 → 70점
 * 5% 이상 → 0점
 */
function unbalanceQuality(pct: number | null): number | null {
  if (pct == null) return null;
  const u = Math.max(0, pct);
  if (u <= 1) return 100 - u * 10;
  if (u <= 2) return 90 - (u - 1) * 20;
  if (u <= 5) return 70 - ((u - 2) * 70) / 3;
  return 0;
}

const QUALITY_WEIGHTS = QUALITY_REFS.weights;

function weightedQuality(
  parts: Array<{ score: number | null; weight: number }>,
): number | null {
  let w = 0;
  let acc = 0;
  for (const p of parts) {
    if (p.score == null) continue;
    acc += p.score * p.weight;
    w += p.weight;
  }
  if (w <= 0) return null;
  return acc / w;
}

function qualityFromSnapshot(
  s: PowerSnapshot,
  side: "before" | "after",
): { score: number | null; thd: number | null; unbalance: number | null } {
  const pf = pfQuality(num(side === "before" ? s.tpf1 : s.tpf2));
  const thd = avg(
    side === "before"
      ? [s.loadCurrentTHDL1, s.loadCurrentTHDL2, s.loadCurrentTHDL3]
      : [s.gridCurrentTHDL1, s.gridCurrentTHDL2, s.gridCurrentTHDL3],
  );
  const unbalance = phaseUnbalancePct(s.vL1, s.vL2, s.vL3);
  return {
    score: weightedQuality([
      { score: pf, weight: QUALITY_WEIGHTS.pf },
      { score: thdQuality(thd), weight: QUALITY_WEIGHTS.thd },
      { score: unbalanceQuality(unbalance), weight: QUALITY_WEIGHTS.unbalance },
    ]),
    thd,
    unbalance,
  };
}

function pfCostYearFromSnapshot(s: PowerSnapshot): number | null {
  const before = num(s.tpf1);
  const after = num(s.tpf2);
  const demandKw = num(s.uncompP) ?? num(s.uncompS);
  if (before == null || after == null || demandKw == null || demandKw <= 0) {
    return null;
  }
  const monthlyBasic = demandKw * OPS_SAVINGS.demandKrwPerKwMonth;
  const delta = pfChargeRatio(before) - pfChargeRatio(after);
  return monthlyBasic * delta * 12;
}

export function computeOpsSavings(
  device: PowerSnapshot,
  readings: TimedReading[] = [],
): OpsSavings {
  const pfBefore = num(device.tpf1);
  const pfAfter = num(device.tpf2);
  const qBefore = num(device.uncompQ);
  const qAfter = num(device.compQ);
  const sBefore = num(device.uncompS);
  const sAfter = num(device.compS);

  const qReducedPct =
    qBefore != null && qAfter != null && qBefore > 0
      ? Math.max(0, ((qBefore - qAfter) / qBefore) * 100)
      : null;
  const sFreedKva =
    sBefore != null && sAfter != null ? Math.max(0, sBefore - sAfter) : null;
  const qualityBefore = qualityFromSnapshot(device, "before");
  const qualityAfter = qualityFromSnapshot(device, "after");

  const sorted = [...readings].sort(
    (a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  let kWhWindow: number | null = null;
  let windowHours: number | null = null;
  let kWhYear: number | null = null;
  let kwSaved = estimateKwSaved(device);

  if (sorted.length >= 2) {
    let energy = 0;
    let used = false;
    for (let i = 1; i < sorted.length; i++) {
      const t0 = new Date(sorted[i - 1].recordedAt).getTime();
      const t1 = new Date(sorted[i].recordedAt).getTime();
      const dt = (t1 - t0) / 3_600_000;
      if (!(dt > 0) || dt > 6) continue;
      const kw =
        estimateKwSaved(sorted[i]) ?? estimateKwSaved(sorted[i - 1]);
      if (kw == null) continue;
      energy += kw * dt;
      used = true;
    }
    const span =
      (new Date(sorted[sorted.length - 1].recordedAt).getTime() -
        new Date(sorted[0].recordedAt).getTime()) /
      3_600_000;
    if (used && span > 0.5) {
      kWhWindow = energy;
      windowHours = span;
      kWhYear = energy * (OPS_SAVINGS.hoursPerYear / span);
      const kwAvg = energy / span;
      if (kwSaved == null) kwSaved = kwAvg;
    }
  }

  if (kWhYear == null && kwSaved != null) {
    kWhYear = kwSaved * OPS_SAVINGS.hoursPerYear;
  }

  const carbonKgYear =
    kWhYear != null ? kWhYear * OPS_SAVINGS.co2KgPerKwh : null;
  const treesYear =
    carbonKgYear != null
      ? carbonKgYear / OPS_SAVINGS.treeKgCo2PerYear
      : null;
  const energyCostYear =
    kWhYear != null ? kWhYear * OPS_SAVINGS.krwPerKwh : null;
  const pfCostYear = pfCostYearFromSnapshot(device);
  const costYear =
    energyCostYear != null || pfCostYear != null
      ? (energyCostYear ?? 0) + (pfCostYear ?? 0)
      : null;

  return {
    kwSaved,
    kWhYear,
    kWhWindow,
    windowHours,
    carbonKgYear,
    treesYear,
    energyCostYear,
    pfCostYear,
    costYear,
    qReducedPct,
    pfBefore,
    pfAfter,
    sFreedKva,
    qualityBefore: qualityBefore.score,
    qualityAfter: qualityAfter.score,
    qualityThd: qualityAfter.thd,
    qualityUnbalance: qualityAfter.unbalance,
  };
}

export function formatKwhParts(value: number): { value: string; unit: string } {
  if (value >= 100_000) {
    return {
      value: (value / 1000).toFixed(value >= 1_000_000 ? 0 : 1),
      unit: "MWh/년",
    };
  }
  return { value: Math.round(value).toLocaleString("ko-KR"), unit: "kWh/년" };
}

export function formatKwh(value: number): string {
  const p = formatKwhParts(value);
  return `${p.value} ${p.unit.replace("/년", "")}`;
}

export function formatCarbon(kg: number): { value: string; unit: string } {
  if (kg >= 1000) {
    return { value: (kg / 1000).toFixed(kg >= 10_000 ? 0 : 1), unit: "tCO₂" };
  }
  return { value: Math.round(kg).toLocaleString("ko-KR"), unit: "kgCO₂" };
}

export function formatKrw(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}억 원`;
  }
  if (abs >= 10_000) {
    return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만 원`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

export function formatTrees(trees: number): string {
  if (trees >= 100) return `소나무 ${Math.round(trees).toLocaleString("ko-KR")}그루`;
  if (trees >= 10) return `소나무 ${trees.toFixed(0)}그루`;
  return `소나무 ${trees.toFixed(1)}그루`;
}

export function formatQuality(score: number): string {
  return `${Math.round(score)}`;
}
