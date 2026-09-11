import type { MetricStats, WatchFacts } from "./watchFacts.js";
import { WATCH_THRESHOLDS as T } from "./watchThresholds.js";

export type WatchAnomalyLevel = "warn" | "danger";
export type WatchAnomalyScope = "now" | "window";

export type WatchAnomaly = {
  code: string;
  level: WatchAnomalyLevel;
  metric: string;
  /** 한눈에 보이는 짧은 제목 */
  title: string;
  message: string;
  value: number | null;
  threshold: number;
  /** now = 현재 상태, window = 최근 N시간 중 한 번 */
  scope: WatchAnomalyScope;
  /** 이상값이 찍힌 시각(이력) 또는 마지막 수신(지금) */
  at: string | null;
};

function pfLevel(signed: number | null): WatchAnomalyLevel | null {
  if (signed == null) return null;
  const mag = Math.abs(signed);
  if (mag < T.pfDanger) return "danger";
  if (mag < T.pfWarn) return "warn";
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

function worstVoltage(phases: MetricStats[]): {
  value: number;
  ratio: number;
  at: string | null;
} | null {
  let best: { value: number; ratio: number; at: string | null } | null = null;
  for (const s of phases) {
    const candidates: Array<{ value: number | null; at: string | null }> = [
      { value: s.min, at: s.minAt },
      { value: s.max, at: s.maxAt },
    ];
    for (const c of candidates) {
      if (c.value == null) continue;
      const ratio = Math.abs(c.value - T.voltageNominal) / T.voltageNominal;
      if (!best || ratio > best.ratio) {
        best = { value: c.value, ratio, at: c.at };
      }
    }
  }
  return best;
}

function push(out: WatchAnomaly[], item: WatchAnomaly | null) {
  if (item) out.push(item);
}

function pfCopy(
  hours: number,
  shortTitle: string,
  signed: number,
  limit: number,
): { title: string; message: string } {
  const mag = Math.abs(signed);
  const lead = signed < 0 ? " (진상)" : "";
  return {
    title: shortTitle,
    message: `최근 ${hours}시간 중 최저 ${mag}%${lead} · 기준 ${limit}% 이상`,
  };
}

function voltageCopy(
  hours: number,
  value: number,
  level: WatchAnomalyLevel,
): { title: string; message: string } {
  const bandPct = Math.round(
    (level === "danger" ? T.voltageDangerPct : T.voltageWarnPct) * 100,
  );
  const lo = Math.round(T.voltageNominal * (1 - bandPct / 100));
  const hi = Math.round(T.voltageNominal * (1 + bandPct / 100));
  if (Math.abs(value) < 5) {
    return {
      title: "전압 없음",
      message: `최근 ${hours}시간 중 측정값 ${value}V. ${T.voltageNominal}V가 나와야 합니다.`,
    };
  }
  if (value < T.voltageNominal) {
    return {
      title: "전압 낮음",
      message: `최근 ${hours}시간 중 ${value}V · 허용 ${lo}~${hi}V (기준 ${T.voltageNominal}V ±${bandPct}%)`,
    };
  }
  return {
    title: "전압 높음",
    message: `최근 ${hours}시간 중 ${value}V · 허용 ${lo}~${hi}V (기준 ${T.voltageNominal}V ±${bandPct}%)`,
  };
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
      title: "통신 끊김",
      message: "마지막 수신 후 30분이 지났습니다.",
      value: null,
      threshold: 30,
      scope: "now",
      at: facts.lastSeenAt,
    });
  }

  if (facts.sampleCount === 0) {
    out.push({
      code: "no_readings",
      level: "warn",
      metric: "history",
      title: "이력 없음",
      message: `최근 ${hours}시간 값이 없습니다.`,
      value: 0,
      threshold: 1,
      scope: "window",
      at: null,
    });
  }

  const tpfWorst = facts.pf.tpfAfter.minMagSigned;
  const tpfLv = pfLevel(tpfWorst);
  if (tpfLv && tpfWorst != null) {
    const limit = tpfLv === "danger" ? T.pfDanger : T.pfWarn;
    const copy = pfCopy(hours, "종합역률 낮음", tpfWorst, limit);
    push(out, {
      code: "tpf_after_low",
      level: tpfLv,
      metric: "tpf",
      title: copy.title,
      message: copy.message,
      value: Math.abs(tpfWorst),
      threshold: limit,
      scope: "window",
      at: facts.pf.tpfAfter.minMagAt,
    });
  }

  const dpfWorst = facts.pf.dpfAfter.minMagSigned;
  const dpfLv = pfLevel(dpfWorst);
  if (dpfLv && dpfWorst != null) {
    const limit = dpfLv === "danger" ? T.pfDanger : T.pfWarn;
    const copy = pfCopy(hours, "변위역률 낮음", dpfWorst, limit);
    push(out, {
      code: "dpf_after_low",
      level: dpfLv,
      metric: "dpf",
      title: copy.title,
      message: copy.message,
      value: Math.abs(dpfWorst),
      threshold: limit,
      scope: "window",
      at: facts.pf.dpfAfter.minMagAt,
    });
  }

  // 보상 전 역률이 나쁜데 보상 후에도 그대로면 장비가 일을 안 하고 있다.
  const comp = facts.compensation;
  if (
    comp.tpfGain != null &&
    comp.tpfBefore != null &&
    comp.tpfAfter != null &&
    comp.tpfBefore < T.compPfMaxBefore &&
    comp.tpfGain < T.compPfGainWarn
  ) {
    out.push({
      code: "pf_not_compensated",
      level: comp.tpfGain < T.compPfGainDanger ? "danger" : "warn",
      metric: "tpf",
      title: "역률 보상 미흡",
      message: `최근 ${hours}시간 평균 보상 전 ${comp.tpfBefore}% → 보상 후 ${comp.tpfAfter}% · 개선 ${comp.tpfGain}%p (기준 ${T.compPfGainWarn}%p 이상)`,
      value: comp.tpfGain,
      threshold: T.compPfGainWarn,
      scope: "window",
      at: facts.windowEnd,
    });
  }

  const gridThd = facts.thd.gridMax;
  if (gridThd != null && gridThd >= T.thdDanger) {
    out.push({
      code: "thd_grid_high",
      level: "danger",
      metric: "thd",
      title: "전류 왜곡",
      message: `최근 ${hours}시간 중 최고 ${gridThd}%. ${T.thdDanger}% 이하여야 합니다.`,
      value: gridThd,
      threshold: T.thdDanger,
      scope: "window",
      at: facts.thd.gridMaxAt,
    });
  }

  // 부하측이 왜곡돼 있는데 계통측이 같이 왜곡돼 있으면 필터가 안 잡고 있는 것.
  if (
    comp.thdReduction != null &&
    comp.thdBefore != null &&
    comp.thdAfter != null &&
    comp.thdBefore >= T.compThdMinBefore &&
    comp.thdReduction < T.compThdReductionWarn
  ) {
    const pct = Math.round(comp.thdReduction * 100);
    const limit = Math.round(T.compThdReductionWarn * 100);
    out.push({
      code: "thd_not_compensated",
      level: comp.thdReduction < T.compThdReductionDanger ? "danger" : "warn",
      metric: "thd",
      title: "고조파 보상 미흡",
      message: `최근 ${hours}시간 평균 부하측 ${comp.thdBefore}% → 계통측 ${comp.thdAfter}% · 저감 ${pct}% (기준 ${limit}% 이상)`,
      value: pct,
      threshold: limit,
      scope: "window",
      at: facts.windowEnd,
    });
  }

  const volt = worstVoltage([facts.voltage.l1, facts.voltage.l2, facts.voltage.l3]);
  if (volt) {
    if (volt.ratio > T.voltageDangerPct) {
      const copy = voltageCopy(hours, volt.value, "danger");
      out.push({
        code: "voltage_deviation",
        level: "danger",
        metric: "voltage",
        title: copy.title,
        message: copy.message,
        value: volt.value,
        threshold: T.voltageNominal * (1 - T.voltageDangerPct),
        scope: "window",
        at: volt.at,
      });
    } else if (volt.ratio > T.voltageWarnPct) {
      const copy = voltageCopy(hours, volt.value, "warn");
      out.push({
        code: "voltage_deviation",
        level: "warn",
        metric: "voltage",
        title: copy.title,
        message: copy.message,
        value: volt.value,
        threshold: T.voltageNominal * (1 - T.voltageWarnPct),
        scope: "window",
        at: volt.at,
      });
    }
  }

  const unb = facts.voltage.unbalanceMax;
  if (unb != null && unb >= T.unbalanceWarnPct) {
    out.push({
      code: "voltage_unbalance",
      level: "warn",
      metric: "unbalance",
      title: "전압 불평형",
      message: `최근 ${hours}시간 중 불평형 최고 ${unb}% · 권고 ${T.unbalanceWarnPct}% 이하`,
      value: unb,
      threshold: T.unbalanceWarnPct,
      scope: "window",
      at: facts.voltage.unbalanceMaxAt,
    });
  }

  const areaLv = tempLevel(facts.thermal.areaMax, T.areaWarn, T.areaAlarm);
  if (areaLv && facts.thermal.areaMax != null) {
    const v = facts.thermal.areaMax;
    const limit = areaLv === "danger" ? T.areaAlarm : T.areaWarn;
    out.push({
      code: "area_temp_high",
      level: areaLv,
      metric: "areaTemp",
      title: "주위 온도 높음",
      message:
        areaLv === "danger"
          ? `최근 ${hours}시간 중 최고 ${v}°C · 경보 ${T.areaAlarm}°C`
          : `최근 ${hours}시간 중 최고 ${v}°C · 주의 ${T.areaWarn}°C`,
      value: v,
      threshold: limit,
      scope: "window",
      at: facts.thermal.areaMaxAt,
    });
  }

  const modLv = tempLevel(facts.thermal.moduleMax, T.moduleWarn, T.moduleAlarm);
  if (modLv && facts.thermal.moduleMax != null) {
    const v = facts.thermal.moduleMax;
    const limit = modLv === "danger" ? T.moduleAlarm : T.moduleWarn;
    out.push({
      code: "module_temp_high",
      level: modLv,
      metric: "moduleTemp",
      title: "모듈 온도 높음",
      message:
        modLv === "danger"
          ? `최근 ${hours}시간 중 최고 ${v}°C · 경보 ${T.moduleAlarm}°C`
          : `최근 ${hours}시간 중 최고 ${v}°C · 주의 ${T.moduleWarn}°C`,
      value: v,
      threshold: limit,
      scope: "window",
      at: facts.thermal.moduleMaxAt,
    });
  }

  // 한 모듈만 유독 뜨거우면 그 모듈의 냉각이나 전류 분담이 깨진 것.
  const spread = facts.thermal.moduleSpreadMax;
  const spreadLv = tempLevel(spread, T.moduleSpreadWarn, T.moduleSpreadAlarm);
  if (spreadLv && spread != null) {
    const limit =
      spreadLv === "danger" ? T.moduleSpreadAlarm : T.moduleSpreadWarn;
    out.push({
      code: "module_temp_spread",
      level: spreadLv,
      metric: "moduleTemp",
      title: "모듈 온도 편차",
      message: `최근 ${hours}시간 중 운전 모듈 간 최대 ${spread}°C 차이 · 기준 ${limit}°C 이내`,
      value: spread,
      threshold: limit,
      scope: "window",
      at: facts.thermal.moduleSpreadMaxAt,
    });
  }

  const mods = facts.modules;
  if (mods.total != null && mods.fault > 0) {
    out.push({
      code: "module_fault_state",
      level: "danger",
      metric: "module",
      title: "모듈 고장 상태",
      message: `모듈 ${mods.total}대 중 ${mods.fault}대가 FAULT입니다.`,
      value: mods.fault,
      threshold: 1,
      scope: "now",
      at: mods.at,
    });
  }
  if (mods.total != null && mods.offline > 0) {
    out.push({
      code: "module_offline",
      level: mods.running === 0 ? "danger" : "warn",
      metric: "module",
      title: "모듈 정지",
      message: `모듈 ${mods.total}대 중 ${mods.offline}대 OFFLINE · 운전 ${mods.running}대. 보상 용량이 그만큼 빠집니다.`,
      value: mods.offline,
      threshold: 1,
      scope: "now",
      at: mods.at,
    });
  }

  // 팬 정지는 과열보다 먼저 잡히는 신호다. 모듈이 서 있으면 팬도 서는 게 정상.
  const fan = facts.fan;
  if (fan.total != null && fan.stopped > 0 && fan.whileRunning) {
    out.push({
      code: "fan_stopped",
      level: "danger",
      metric: "fan",
      title: "냉각팬 정지",
      message: `운전 중인데 냉각팬 ${fan.total}대 중 ${fan.stopped}대가 멈춰 있습니다.`,
      value: fan.stopped,
      threshold: 1,
      scope: "now",
      at: fan.at,
    });
  }

  const cap = facts.capacity;
  if (cap.operatingRatioMax != null && cap.saturatedSampleCount > 0) {
    const pct = Math.round(cap.operatingRatioMax * 100);
    out.push({
      code: "capacity_saturated",
      level: "warn",
      metric: "capacity",
      title: "보상 용량 포화",
      message: `최근 ${hours}시간 중 운전 용량이 총 용량의 ${pct}%까지 올라갔습니다 · 여유 최소 ${cap.marginMin ?? 0}`,
      value: pct,
      threshold: Math.round(T.capacitySaturatedRatio * 100),
      scope: "window",
      at: cap.operatingRatioMaxAt,
    });
  }

  const active = extras.activeFaultCount ?? 0;
  if (active > 0) {
    out.push({
      code: "active_faults",
      level: "danger",
      metric: "fault",
      title: "미확인 고장",
      message: `확인하지 않은 고장 ${active}건`,
      value: active,
      threshold: 1,
      scope: "now",
      at: null,
    });
  }

  // module_offline처럼 now/warn 항목이 생겼으므로 심각도를 scope보다 먼저 본다.
  out.sort((a, b) => {
    if (a.level !== b.level) return a.level === "danger" ? -1 : 1;
    if (a.scope !== b.scope) return a.scope === "now" ? -1 : 1;
    return a.code.localeCompare(b.code);
  });
  return out;
}
