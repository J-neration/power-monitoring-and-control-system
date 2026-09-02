import type { MetricStats, WatchFacts } from "./watchFacts";
import { WATCH_THRESHOLDS as T } from "./watchThresholds";

export type WatchAnomalyLevel = "warn" | "danger";

export type WatchAnomaly = {
  code: string;
  level: WatchAnomalyLevel;
  metric: string;
  message: string;
  value: number | null;
  threshold: number;
};

function pfLevel(min: number | null): WatchAnomalyLevel | null {
  if (min == null) return null;
  if (min < T.pfDanger) return "danger";
  if (min < T.pfWarn) return "warn";
  return null;
}

function tempLevel(
  max: number | null,
  warn: number,
  alarm: number,
): WatchAnomalyLevel | null {
  if (max == null) return null;
  if (max >= alarm) return "danger";
  if (max >= warn) return "warn";
  return null;
}

function worstVoltage(phases: MetricStats[]): { value: number; ratio: number } | null {
  const vs: number[] = [];
  for (const s of phases) {
    if (s.min != null) vs.push(s.min);
    if (s.max != null) vs.push(s.max);
  }
  if (!vs.length) return null;
  let value = vs[0];
  let ratio = Math.abs(value - T.voltageNominal) / T.voltageNominal;
  for (const v of vs) {
    const r = Math.abs(v - T.voltageNominal) / T.voltageNominal;
    if (r > ratio) {
      value = v;
      ratio = r;
    }
  }
  return { value, ratio };
}

function push(
  out: WatchAnomaly[],
  item: WatchAnomaly | null,
) {
  if (item) out.push(item);
}

export function extractWatchAnomalies(
  facts: WatchFacts,
  extras: { activeFaultCount?: number } = {},
): WatchAnomaly[] {
  const out: WatchAnomaly[] = [];
  const hours = facts.hours;

  if (facts.commLost) {
    out.push({
      code: "comm_lost",
      level: "danger",
      metric: "comm",
      message: "마지막 수신 후 30분이 지나 통신이 끊긴 상태입니다.",
      value: null,
      threshold: 30,
    });
  }

  if (facts.sampleCount === 0) {
    out.push({
      code: "no_readings",
      level: "warn",
      metric: "history",
      message: `최근 ${hours}시간 이력이 없습니다.`,
      value: 0,
      threshold: 1,
    });
  }

  const tpfMin = facts.pf.tpfAfter.min;
  const tpfLv = pfLevel(tpfMin);
  if (tpfLv && tpfMin != null) {
    push(out, {
      code: "tpf_after_low",
      level: tpfLv,
      metric: "tpf",
      message:
        tpfLv === "danger"
          ? `보상 후 TPF 최저 ${tpfMin}%로 위험(${T.pfDanger}% 미만)입니다.`
          : `보상 후 TPF 최저 ${tpfMin}%로 주의(${T.pfWarn}% 미만)입니다.`,
      value: tpfMin,
      threshold: tpfLv === "danger" ? T.pfDanger : T.pfWarn,
    });
  }

  const dpfMin = facts.pf.dpfAfter.min;
  const dpfLv = pfLevel(dpfMin);
  if (dpfLv && dpfMin != null) {
    push(out, {
      code: "dpf_after_low",
      level: dpfLv,
      metric: "dpf",
      message:
        dpfLv === "danger"
          ? `보상 후 DPF 최저 ${dpfMin}%로 위험(${T.pfDanger}% 미만)입니다.`
          : `보상 후 DPF 최저 ${dpfMin}%로 주의(${T.pfWarn}% 미만)입니다.`,
      value: dpfMin,
      threshold: dpfLv === "danger" ? T.pfDanger : T.pfWarn,
    });
  }

  const gridThd = facts.thd.gridMax;
  if (gridThd != null && gridThd >= T.thdDanger) {
    out.push({
      code: "thd_grid_high",
      level: "danger",
      metric: "thd",
      message: `보상 후 전류 THD 최고 ${gridThd}%가 위험 기준(${T.thdDanger}%) 이상입니다.`,
      value: gridThd,
      threshold: T.thdDanger,
    });
  }

  const volt = worstVoltage([facts.voltage.l1, facts.voltage.l2, facts.voltage.l3]);
  if (volt) {
    if (volt.ratio > T.voltageDangerPct) {
      out.push({
        code: "voltage_deviation",
        level: "danger",
        metric: "voltage",
        message: `상전압 ${volt.value}V가 공칭 ${T.voltageNominal}V에서 10%를 초과합니다.`,
        value: volt.value,
        threshold: T.voltageNominal * (1 - T.voltageDangerPct),
      });
    } else if (volt.ratio > T.voltageWarnPct) {
      out.push({
        code: "voltage_deviation",
        level: "warn",
        metric: "voltage",
        message: `상전압 ${volt.value}V가 공칭 ${T.voltageNominal}V에서 5%를 초과합니다.`,
        value: volt.value,
        threshold: T.voltageNominal * (1 - T.voltageWarnPct),
      });
    }
  }

  const unb = facts.voltage.unbalanceMax;
  if (unb != null && unb >= T.unbalanceWarnPct) {
    out.push({
      code: "voltage_unbalance",
      level: "warn",
      metric: "unbalance",
      message: `전압 불평형 최고 ${unb}%가 권고(${T.unbalanceWarnPct}%) 이상입니다.`,
      value: unb,
      threshold: T.unbalanceWarnPct,
    });
  }

  const areaLv = tempLevel(facts.thermal.areaMax, T.areaWarn, T.areaAlarm);
  if (areaLv && facts.thermal.areaMax != null) {
    const v = facts.thermal.areaMax;
    out.push({
      code: "area_temp_high",
      level: areaLv,
      metric: "areaTemp",
      message:
        areaLv === "danger"
          ? `주위 온도 최고 ${v}°C가 경보(${T.areaAlarm}°C) 이상입니다.`
          : `주위 온도 최고 ${v}°C가 주의(${T.areaWarn}°C) 이상입니다.`,
      value: v,
      threshold: areaLv === "danger" ? T.areaAlarm : T.areaWarn,
    });
  }

  const modLv = tempLevel(facts.thermal.moduleMax, T.moduleWarn, T.moduleAlarm);
  if (modLv && facts.thermal.moduleMax != null) {
    const v = facts.thermal.moduleMax;
    out.push({
      code: "module_temp_high",
      level: modLv,
      metric: "moduleTemp",
      message:
        modLv === "danger"
          ? `모듈 온도 최고 ${v}°C가 경보(${T.moduleAlarm}°C) 이상입니다.`
          : `모듈 온도 최고 ${v}°C가 주의(${T.moduleWarn}°C) 이상입니다.`,
      value: v,
      threshold: modLv === "danger" ? T.moduleAlarm : T.moduleWarn,
    });
  }

  const active = extras.activeFaultCount ?? 0;
  if (active > 0) {
    out.push({
      code: "active_faults",
      level: "danger",
      metric: "fault",
      message: `활성 fault ${active}건이 있습니다.`,
      value: active,
      threshold: 1,
    });
  }

  out.sort((a, b) => {
    if (a.level === b.level) return a.code.localeCompare(b.code);
    return a.level === "danger" ? -1 : 1;
  });
  return out;
}
