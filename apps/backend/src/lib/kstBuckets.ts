/** Asia/Seoul. 한국은 DST가 없으므로 달력 경계만 UTC+9로 잡고, 이후 가감은 절대시간이다. */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function kstParts(input: Date): KstParts {
  const k = new Date(input.getTime() + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    second: k.getUTCSeconds(),
  };
}

export function kstHourStart(input: Date): Date {
  const p = kstParts(input);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour) - KST_OFFSET_MS);
}

export function kstDayStart(input: Date): Date {
  const p = kstParts(input);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - KST_OFFSET_MS);
}

export function kstMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
}

export function kstYearStart(year: number): Date {
  return kstMonthStart(year, 1);
}

export function addHours(input: Date, hours: number): Date {
  return new Date(input.getTime() + hours * HOUR_MS);
}

export function addDays(input: Date, days: number): Date {
  return new Date(input.getTime() + days * DAY_MS);
}

export function kstDateKey(input: Date): string {
  const p = kstParts(input);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 현재 시각이 속한 KST 시가 아직 닫히지 않았으면 그 직전 정시. */
export function lastClosedHourStart(now: Date): Date {
  return addHours(kstHourStart(now), -1);
}
