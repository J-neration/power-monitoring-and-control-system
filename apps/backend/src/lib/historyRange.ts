import { addDays, addHours, daysInMonth, kstDayStart, kstMonthStart, kstYearStart } from "./kstBuckets.js";

export type HistoryPeriod = "day" | "week" | "month" | "year";
export type HistoryAggregation = "avg" | "min" | "max";
export type HistoryResolution = "raw" | "hourly" | "daily";

export type ResolvedHistory = {
  period: HistoryPeriod;
  aggregation: HistoryAggregation;
  resolution: HistoryResolution;
  from: Date;
  to: Date;
};

const PERIODS = new Set<HistoryPeriod>(["day", "week", "month", "year"]);
const AGGS = new Set<HistoryAggregation>(["avg", "min", "max"]);
const MAX_POINTS = 1200;

function autoResolution(period: HistoryPeriod): HistoryResolution {
  if (period === "day") return "raw";
  if (period === "week") return "hourly";
  return "daily";
}

function parseYearMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000);
}

export function resolveHistoryQuery(input: {
  period?: string;
  aggregation?: string;
  resolution?: string;
  start?: string;
  end?: string;
  now?: Date;
  intervalMinutes?: number;
}): { ok: true; value: ResolvedHistory } | { ok: false; message: string } {
  const now = input.now ?? new Date();
  const period = (input.period ?? "day").trim() as HistoryPeriod;
  if (!PERIODS.has(period)) {
    return { ok: false, message: "period 는 day, week, month, year 중 하나여야 합니다." };
  }
  const aggregation = (input.aggregation ?? "avg").trim() as HistoryAggregation;
  if (!AGGS.has(aggregation)) {
    return { ok: false, message: "aggregation 은 avg, min, max 중 하나여야 합니다." };
  }

  const requested = (input.resolution ?? "auto").trim();
  let resolution: HistoryResolution;
  if (requested === "auto" || requested === "") {
    resolution = autoResolution(period);
  } else if (requested === "raw" || requested === "hourly" || requested === "daily") {
    resolution = requested;
  } else {
    return { ok: false, message: "resolution 은 auto, raw, hourly, daily 중 하나여야 합니다." };
  }

  const intervalMinutes = input.intervalMinutes ?? 10;
  const startRaw = input.start?.trim() ?? "";
  const endRaw = input.end?.trim() ?? "";
  let from: Date;
  let to: Date;

  if (!startRaw) {
    if (period === "day") {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      to = now;
    } else if (period === "week") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      to = now;
    } else if (period === "month") {
      to = addDays(kstDayStart(now), 1);
      from = addDays(to, -30);
    } else {
      to = addDays(kstDayStart(now), 1);
      from = addDays(to, -365);
    }
  } else if (/^\d{4}$/.test(startRaw)) {
    if (period !== "year") {
      return { ok: false, message: "연도는 period=year 에서만 선택할 수 있습니다." };
    }
    const year = Number(startRaw);
    from = kstYearStart(year);
    to = kstYearStart(year + 1);
  } else if (/^\d{4}-\d{2}$/.test(startRaw)) {
    const ym = parseYearMonth(startRaw);
    if (!ym || period === "day" || period === "week") {
      return { ok: false, message: "월 선택은 period=month 또는 year 에서 YYYY-MM 형식이어야 합니다." };
    }
    from = kstMonthStart(ym.year, ym.month);
    to = kstMonthStart(ym.month === 12 ? ym.year + 1 : ym.year, ym.month === 12 ? 1 : ym.month + 1);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) {
    const day = parseDateOnly(startRaw);
    if (!day) return { ok: false, message: "start 날짜가 올바르지 않습니다." };
    from = day;
    if (period === "day") to = addDays(day, 1);
    else if (period === "week") to = addDays(day, 7);
    else if (period === "month") to = addDays(day, 30);
    else to = addDays(day, 365);
  } else {
    const parsed = new Date(startRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "start 시각을 해석할 수 없습니다." };
    }
    from = parsed;
    if (period === "day") to = addHours(parsed, 24);
    else if (period === "week") to = addDays(parsed, 7);
    else if (period === "month") to = addDays(parsed, 30);
    else to = addDays(parsed, 365);
  }

  if (endRaw) {
    const end = new Date(endRaw);
    if (Number.isNaN(end.getTime())) {
      return { ok: false, message: "end 시각을 해석할 수 없습니다." };
    }
    to = end;
  }

  if (to.getTime() <= from.getTime()) {
    return { ok: false, message: "조회 종료 시각은 시작 시각보다 뒤여야 합니다." };
  }

  const stepMs =
    resolution === "raw"
      ? intervalMinutes * 60 * 1000
      : resolution === "hourly"
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  const points = Math.ceil((to.getTime() - from.getTime()) / stepMs);
  if (points > MAX_POINTS) {
    return {
      ok: false,
      message: `조회 구간이 너무 깁니다 (${points}포인트). 기간에 맞는 resolution 을 사용하세요.`,
    };
  }

  return {
    ok: true,
    value: { period, aggregation, resolution, from, to },
  };
}
