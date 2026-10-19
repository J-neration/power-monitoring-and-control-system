/**
 * Asia/Seoul formatting without Intl/toLocaleString.
 * The SSR Node runtime lacks ko-KR ICU data ("PM" instead of "오후"),
 * which breaks hydration when server and browser output differ.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function kstParts(input: Date | string | number): KstParts | null {
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const k = new Date(t + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    second: k.getUTCSeconds(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "10. 12. 오후 6:19" (padHour: "10. 12. 오후 06:19") */
export function formatKstMonthDayTime(
  input: Date | string | number,
  { padHour = false }: { padHour?: boolean } = {},
): string {
  const p = kstParts(input);
  if (!p) return "";
  const meridiem = p.hour < 12 ? "오전" : "오후";
  const h12 = p.hour % 12 || 12;
  const hour = padHour ? pad2(h12) : String(h12);
  return `${p.month}. ${p.day}. ${meridiem} ${hour}:${pad2(p.minute)}`;
}

/** "2026. 10. 12. 18:19:00" */
export function formatKstDateTime24(input: Date | string | number): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${p.year}. ${pad2(p.month)}. ${pad2(p.day)}. ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** "2026. 10. 12." */
export function formatKstDate(input: Date | string | number): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${p.year}. ${pad2(p.month)}. ${pad2(p.day)}.`;
}

/** "18:19" */
export function formatKstClock(input: Date | string | number): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "10-12 18:19" */
export function formatKstMonthDayHour(input: Date | string | number): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "10-12" */
export function formatKstMonthDay(input: Date | string | number): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${pad2(p.month)}-${pad2(p.day)}`;
}

/** "26-10-12" */
export function formatKstShortDate(input: Date | string | number): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${String(p.year).slice(2)}-${pad2(p.month)}-${pad2(p.day)}`;
}
