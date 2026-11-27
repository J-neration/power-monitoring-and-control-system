import { prisma } from "../lib/prisma.js";
import { kstDayStart, kstHourStart } from "../lib/kstBuckets.js";
import type { ResolvedHistory } from "../lib/historyRange.js";

/**
 * 차수별 고조파 전류·전압 (HMI 저장소 docs/LTE_HARMONIC_DATA_PLAN.md 3장, 3-1장).
 * 200A HMI 가 1시간마다 1번, 그리고 명령 refreshHarmonics 를 받았을 때 보낸다.
 * 전류는 0.01 A, 전압은 0.1 V 단위 정수 그대로 저장한다. A·V 로 바꾸는 일은 화면이 한다.
 * 전압(volt)은 HMI 펌웨어가 보낼 때만 있다. 없으면 빈 배열 / null.
 */
export const HARMONIC_SOURCES = ["hourly", "command"] as const;
export type HarmonicSource = (typeof HARMONIC_SOURCES)[number];

export type HarmonicPhases = { a: number[]; b: number[]; c: number[] };

/** 전압 고조파: 0.1 V 정수 A/B/C상 + 읽은 시각 */
export type HarmonicVoltage = HarmonicPhases & { recordedAt: Date };

export type HarmonicInput = {
  recordedAt: Date;
  source: HarmonicSource;
  orders: number[];
  uncomp: HarmonicPhases;
  comp: HarmonicPhases;
  volt?: HarmonicVoltage;
};

export type HarmonicRecordDto = {
  id: string;
  recordedAt: Date;
  receivedAt: Date;
  source: string;
  orders: number[];
  uncomp: HarmonicPhases;
  comp: HarmonicPhases;
  /** 전압을 보내지 않는 펌웨어면 null */
  volt: HarmonicVoltage | null;
};

type Row = {
  id: string;
  recordedAt: Date;
  receivedAt: Date;
  source: string;
  orders: number[];
  uncompA: number[];
  uncompB: number[];
  uncompC: number[];
  compA: number[];
  compB: number[];
  compC: number[];
  voltA: number[];
  voltB: number[];
  voltC: number[];
  voltRecordedAt: Date | null;
};

const toDto = (r: Row): HarmonicRecordDto => ({
  id: r.id,
  recordedAt: r.recordedAt,
  receivedAt: r.receivedAt,
  source: r.source,
  orders: r.orders,
  uncomp: { a: r.uncompA, b: r.uncompB, c: r.uncompC },
  comp: { a: r.compA, b: r.compB, c: r.compC },
  volt:
    r.voltA.length > 0 || r.voltB.length > 0 || r.voltC.length > 0
      ? { a: r.voltA, b: r.voltB, c: r.voltC, recordedAt: r.voltRecordedAt ?? r.recordedAt }
      : null,
});

/**
 * HMI 가 값을 읽은 시각(ts)을 믿을 수 있는 범위.
 * HMI 는 길어야 30분 전에 읽은 값을 보낸다(200A 백그라운드 읽기 30분 주기).
 * 그보다 한참 이전이면 HMI 시계(RTC)가 틀린 것이다. 2026-11-26 벤치 보드 RTC 가
 * 2024-11 로 남아 있어 기록이 2년 전 날짜로 저장됐고, 이력 일간에서 안 보였다.
 */
export const HARMONIC_TS_MAX_PAST_MS = 2 * 60 * 60 * 1000;
export const HARMONIC_TS_MAX_FUTURE_MS = 5 * 60 * 1000;

/** HMI 시계가 틀렸으면(받은 시각보다 2시간 넘게 이전이거나 5분 넘게 미래) 받은 시각을 쓴다. */
export const harmonicRecordedAt = (ts: number | undefined, now: Date): Date => {
  if (ts === undefined || !Number.isFinite(ts)) return now;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const t = now.getTime();
  if (ms < t - HARMONIC_TS_MAX_PAST_MS || ms > t + HARMONIC_TS_MAX_FUTURE_MS) return now;
  return new Date(ms);
};

/**
 * 전압을 읽은 시각. HMI 는 전류 ts 와 전압 volt.ts 를 같은 RTC 로 찍는다.
 * 그래서 둘의 차이(전압이 몇 초 늦게, 또는 지난 값이라 몇 시간 일찍 읽힘)만 믿고,
 * 기준은 이미 검사한 전류 시각(recordedAt)에 둔다. RTC 가 통째로 틀려도 차이는 맞다.
 * 차이를 모르면(둘 중 하나 없음) 전류 시각과 같다고 본다.
 */
export const harmonicVoltRecordedAt = (
  recordedAt: Date,
  ts: number | undefined,
  voltTs: number | undefined,
): Date => {
  if (ts === undefined || voltTs === undefined || !Number.isFinite(ts) || !Number.isFinite(voltTs)) {
    return recordedAt;
  }
  const toMs = (v: number) => (v > 1e12 ? v : v * 1000);
  const t = recordedAt.getTime() + (toMs(voltTs) - toMs(ts));
  // 전류보다 미래일 수는 거의 없다 (전류 다음에 바로 읽음). 몇 분 넘게 미래면 버린다.
  return t > recordedAt.getTime() + HARMONIC_TS_MAX_FUTURE_MS ? recordedAt : new Date(t);
};

type Triple = { a: number | null; b: number | null; c: number | null };

/** 이력 탭 한 점: 한 차수의 보상 전/후 A/B/C상 (A 단위)과 전압 A/B/C상 (V 단위). 값 없으면 null */
export type HarmonicHistoryPoint = {
  recordedAt: Date;
  uncomp: Triple;
  comp: Triple;
  volt: Triple;
};

export type HarmonicHistorySample = {
  recordedAt: Date;
  orders: number[];
  uncompA: number[];
  uncompB: number[];
  uncompC: number[];
  compA: number[];
  compB: number[];
  compC: number[];
  voltA: number[];
  voltB: number[];
  voltC: number[];
};

/** [묶음, 상, 칸, 정수 → 단위 나눗수]. 전류 0.01 A → A, 전압 0.1 V → V */
const SERIES = [
  ["uncomp", "a", "uncompA", 100],
  ["uncomp", "b", "uncompB", 100],
  ["uncomp", "c", "uncompC", 100],
  ["comp", "a", "compA", 100],
  ["comp", "b", "compB", 100],
  ["comp", "c", "compC", 100],
  ["volt", "a", "voltA", 10],
  ["volt", "b", "voltB", 10],
  ["volt", "c", "voltC", 10],
] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 기록들에서 한 차수만 뽑아 이력 점으로 만든다. DB 없이 계산만 한다.
 * - raw: 기록 1건 = 점 1개 (HMI 는 1시간마다 보내므로 1시간 간격)
 * - hourly / daily: KST 시·일 단위로 묶고 aggregation(min/avg/max)을 적용. 묶음 시각 = 구간 시작
 * 값은 0.01 A 정수 → A, 0.1 V 정수 → V. 전압이 없는 기록은 전압이 null.
 */
export function buildHarmonicHistory(
  samples: HarmonicHistorySample[],
  order: number,
  resolution: ResolvedHistory["resolution"],
  aggregation: ResolvedHistory["aggregation"],
): HarmonicHistoryPoint[] {
  const pick = (s: HarmonicHistorySample) => {
    const i = s.orders.indexOf(order);
    const out: Record<string, number | null> = {};
    for (const [, , col, div] of SERIES) {
      const v = i < 0 ? undefined : s[col][i];
      out[col] = typeof v === "number" && Number.isFinite(v) ? v / div : null;
    }
    return out;
  };
  const toPoint = (recordedAt: Date, v: Record<string, number | null>): HarmonicHistoryPoint => ({
    recordedAt,
    uncomp: { a: v.uncompA, b: v.uncompB, c: v.uncompC },
    comp: { a: v.compA, b: v.compB, c: v.compC },
    volt: { a: v.voltA, b: v.voltB, c: v.voltC },
  });

  const sorted = [...samples].sort((x, y) => x.recordedAt.getTime() - y.recordedAt.getTime());
  if (resolution === "raw") {
    return sorted.map((s) => toPoint(s.recordedAt, pick(s)));
  }

  const bucketOf = resolution === "hourly" ? kstHourStart : kstDayStart;
  const buckets = new Map<number, Record<string, number | null>[]>();
  for (const s of sorted) {
    const key = bucketOf(s.recordedAt).getTime();
    const list = buckets.get(key) ?? [];
    list.push(pick(s));
    buckets.set(key, list);
  }
  const points: HarmonicHistoryPoint[] = [];
  for (const [key, list] of buckets) {
    const agg: Record<string, number | null> = {};
    for (const [, , col] of SERIES) {
      const xs = list.map((v) => v[col]).filter((v): v is number => v != null);
      if (xs.length === 0) agg[col] = null;
      else if (aggregation === "min") agg[col] = Math.min(...xs);
      else if (aggregation === "max") agg[col] = Math.max(...xs);
      else agg[col] = round2(xs.reduce((a, b) => a + b, 0) / xs.length);
    }
    points.push(toPoint(new Date(key), agg));
  }
  return points;
}

export const harmonicService = {
  /** 이력 탭: 한 차수의 기간별 추세. orders = 고를 수 있는 차수 (가장 최근 기록 기준) */
  async history(installationId: string, range: ResolvedHistory, order: number) {
    const rows = await prisma.harmonicRecord.findMany({
      where: { installationId, recordedAt: { gte: range.from, lt: range.to } },
      orderBy: { recordedAt: "asc" },
      select: {
        recordedAt: true,
        orders: true,
        uncompA: true,
        uncompB: true,
        uncompC: true,
        compA: true,
        compB: true,
        compC: true,
        voltA: true,
        voltB: true,
        voltC: true,
      },
    });
    const latest = await prisma.harmonicRecord.findFirst({
      where: { installationId },
      orderBy: { recordedAt: "desc" },
      select: { orders: true },
    });
    return {
      unit: "A",
      voltUnit: "V",
      order,
      orders: latest?.orders ?? [],
      period: range.period,
      aggregation: range.resolution === "raw" ? "avg" : range.aggregation,
      resolution: range.resolution,
      from: range.from,
      to: range.to,
      points: buildHarmonicHistory(rows, order, range.resolution, range.aggregation),
    };
  },

  /** 보관 기간(일)보다 오래된 기록 삭제. 삭제한 건수를 돌려준다. */
  async purgeOlderThan(days: number, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const result = await prisma.harmonicRecord.deleteMany({ where: { recordedAt: { lt: cutoff } } });
    return result.count;
  },

  async record(installationId: string, input: HarmonicInput): Promise<HarmonicRecordDto> {
    const row = await prisma.harmonicRecord.create({
      data: {
        installationId,
        recordedAt: input.recordedAt,
        source: input.source,
        orders: input.orders,
        uncompA: input.uncomp.a,
        uncompB: input.uncomp.b,
        uncompC: input.uncomp.c,
        compA: input.comp.a,
        compB: input.comp.b,
        compC: input.comp.c,
        ...(input.volt
          ? {
              voltA: input.volt.a,
              voltB: input.volt.b,
              voltC: input.volt.c,
              voltRecordedAt: input.volt.recordedAt,
            }
          : {}),
      },
    });
    return toDto(row);
  },

  /** 최근 hours 시간의 기록, 오래된 것부터. 웹의 최신 스펙트럼과 차수별 추세에 쓴다. */
  async list(installationId: string, hours: number): Promise<HarmonicRecordDto[]> {
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await prisma.harmonicRecord.findMany({
      where: { installationId, recordedAt: { gte: from } },
      orderBy: { recordedAt: "asc" },
      take: 2000,
    });
    return rows.map(toDto);
  },

  /**
   * HMI 가 아직 응답하지 않은 module 0 명령 (pending, sent, 만료 전).
   * 고조파 갱신은 module 0 이라 이런 명령이 있으면 새로 만들 수 없다(409). 화면이 탭을 옮겨 와도
   * "요청 중" 을 다시 보여 주고 버튼을 막는 데 쓴다.
   */
  async activeCommand(installationId: string, now = new Date()) {
    return prisma.deviceCommand.findFirst({
      where: {
        installationId,
        module: 0,
        status: { in: ["pending", "sent"] },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, power: true, status: true, createdAt: true, expiresAt: true },
    });
  },

  async latest(installationId: string): Promise<HarmonicRecordDto | null> {
    const row = await prisma.harmonicRecord.findFirst({
      where: { installationId },
      orderBy: { recordedAt: "desc" },
    });
    return row ? toDto(row) : null;
  },
};
