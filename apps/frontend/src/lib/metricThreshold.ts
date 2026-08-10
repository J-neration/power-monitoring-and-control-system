import { THD_THRESHOLDS } from "./chartTheme";

export type MetricLevel = "normal" | "warn" | "danger";

export function formatMetric(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

/** Grid/load current THD (%) thresholds */
export function getThdLevel(value: number | null | undefined): MetricLevel {
  if (value == null || !Number.isFinite(value)) return "normal";
  if (value >= THD_THRESHOLDS.danger) return "danger";
  return "normal";
}

/** Phase voltage (V) deviation from 220 V nominal */
export function getVoltageLevel(value: number | null | undefined): MetricLevel {
  if (value == null || !Number.isFinite(value)) return "normal";
  const deviation = Math.abs(value - 220) / 220;
  if (deviation > 0.1) return "danger";
  if (deviation > 0.05) return "warn";
  return "normal";
}

/** Total power factor (%) — higher is better */
export function getPfLevel(value: number | null | undefined): MetricLevel {
  if (value == null || !Number.isFinite(value)) return "normal";
  if (value < 85) return "danger";
  if (value < 90) return "warn";
  return "normal";
}

export function maxThd(
  ...values: Array<number | null | undefined>
): MetricLevel {
  const finite = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (!finite.length) return "normal";
  return getThdLevel(Math.max(...finite));
}

export function metricLevelClass(level: MetricLevel): string {
  return level === "normal" ? "metric-normal" : `metric-${level}`;
}
