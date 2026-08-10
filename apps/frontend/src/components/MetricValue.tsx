import {
  formatMetric,
  getThdLevel,
  getVoltageLevel,
  getPfLevel,
  metricLevelClass,
  type MetricLevel,
} from "../lib/metricThreshold";

type Props = {
  value: number | null | undefined;
  digits?: number;
  suffix?: string;
  kind?: "default" | "thd" | "voltage" | "pf";
};

function resolveLevel(
  value: number | null | undefined,
  kind: Props["kind"],
): MetricLevel {
  if (kind === "thd") return getThdLevel(value);
  if (kind === "voltage") return getVoltageLevel(value);
  if (kind === "pf") return getPfLevel(value);
  return "normal";
}

export default function MetricValue({
  value,
  digits = 1,
  suffix = "",
  kind = "default",
}: Props) {
  const level = resolveLevel(value, kind);
  const text = formatMetric(value, digits);

  return (
    <span className={`metric-value ${metricLevelClass(level)}`}>
      {text === "-" ? "-" : `${text}${suffix}`}
    </span>
  );
}
