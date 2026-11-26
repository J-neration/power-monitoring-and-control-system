import { prisma } from "../lib/prisma.js";
import { kstDayStart, kstHourStart } from "../lib/kstBuckets.js";
import type { ResolvedHistory } from "../lib/historyRange.js";

/**
 * 차수별 고조파 전류 (HMI 저장소 docs/LTE_HARMONIC_DATA_PLAN.md 3장).
 * 200A HMI 가 1시간마다 1번, 그리고 명령 refreshHarmonics 를 받았을 때 보낸다.
 * 값은 0.01 A 단위 정수 그대로 저장한다. A 로 바꾸는 일은 화면이 한다.
 */
export const HARMONIC_SOURCES = ["hourly", "command"] as const;
export type HarmonicSource = (typeof HARMONIC_SOURCES)[number];

export type HarmonicPhases = { a: number[]; b: number[]; c: number[] };

export type HarmonicInput = {
  recordedAt: Date;
  source: HarmonicSource;
  orders: number[];
  uncomp: HarmonicPhases;
  comp: HarmonicPhases;
};

export type HarmonicRecordDto = {
  id: string;
  recordedAt: Date;
  receivedAt: Date;
  source: string;
  orders: number[];
  uncomp: HarmonicPhases;
  comp: HarmonicPhases;
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
};

const toDto = (r: Row): HarmonicRecordDto => ({
  id: r.id,
  recordedAt: r.recordedAt,
  receivedAt: r.receivedAt,
  source: r.source,
  orders: r.orders,
  uncomp: { a: r.uncompA, b: r.uncompB, c: r.uncompC },
  comp: { a: r.compA, b: r.compB, c: r.compC },
});

/** HMI 시계가 틀렸으면(5분 넘게 미래, 또는 2024년 이전) 수신 시각을 쓴다. */
export const harmonicRecordedAt = (ts: number | undefined, now: Date): Date => {
  if (ts === undefined || !Number.isFinite(ts)) return now;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const minMs = Date.UTC(2024, 0, 1);
  if (ms < minMs || ms > now.getTime() + 5 * 60 * 1000) return now;
  return new Date(ms);
};

/** 이력 탭 한 점: 한 차수의 보상 전/후 A/B/C상 (A 단위, 값 없으면 null) */
export type HarmonicHistoryPoint = {
  recordedAt: Date;
  uncomp: { a: number | null; b: number | null; c: number | null };
  comp: { a: number | null; b: number | null; c: number | null };
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
};

const SERIES = [
  ["uncomp", "a", "uncompA"],
  ["uncomp", "b", "uncompB"],
  ["uncomp", "c", "uncompC"],
  ["comp", "a", "compA"],
  ["comp", "b", "compB"],
  ["comp", "c", "compC"],
] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 기록들에서 한 차수만 뽑아 이력 점으로 만든다. DB 없이 계산만 한다.
 * - raw: 기록 1건 = 점 1개 (HMI 는 1시간마다 보내므로 1시간 간격)
 * - hourly / daily: KST 시·일 단위로 묶고 aggregation(min/avg/max)을 적용. 묶음 시각 = 구간 시작
 * 값은 0.01 A 정수 → A.
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
    for (const [, , col] of SERIES) {
      const v = i < 0 ? undefined : s[col][i];
      out[col] = typeof v === "number" && Number.isFinite(v) ? v / 100 : null;
    }
    return out;
  };
  const toPoint = (recordedAt: Date, v: Record<string, number | null>): HarmonicHistoryPoint => ({
    recordedAt,
    uncomp: { a: v.uncompA, b: v.uncompB, c: v.uncompC },
    comp: { a: v.compA, b: v.compB, c: v.compC },
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
      },
    });
    const latest = await prisma.harmonicRecord.findFirst({
      where: { installationId },
      orderBy: { recordedAt: "desc" },
      select: { orders: true },
    });
    return {
      unit: "A",
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

  async latest(installationId: string): Promise<HarmonicRecordDto | null> {
    const row = await prisma.harmonicRecord.findFirst({
      where: { installationId },
      orderBy: { recordedAt: "desc" },
    });
    return row ? toDto(row) : null;
  },
};
