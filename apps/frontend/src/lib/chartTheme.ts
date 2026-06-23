/** Shared SCADA-style chart theme for Recharts */

export const CHART_COLORS = {
  accent: "#00d4aa",
  accentBright: "#5eead4",
  load: "#f59e0b",
  grid: "#00d4aa",
  gridMuted: "#64748b",
  warn: "#fbbf24",
  danger: "#f87171",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  pink: "#ec4899",
} as const;

export const TEMP_THRESHOLDS = {
  areaWarn: 30,
  areaAlarm: 38,
  moduleWarn: 40,
  moduleAlarm: 90,
} as const;

/** 주의 온도 — 점선(격자와 패턴 구분) */
export const TEMP_WARN_REF = {
  strokeDasharray: "6 4",
  strokeOpacity: 0.55,
  strokeWidth: 1,
} as const;

/** 경보 온도 — 실선(격자 점선과 겹쳐 보이지 않도록) */
export const TEMP_ALARM_REF = {
  strokeWidth: 2,
} as const;

export const TEMP_CHART_MARGIN_RIGHT = 72;

export const THD_THRESHOLDS = { danger: 20 } as const;
export const PF_THRESHOLDS = { warn: 90, danger: 85 } as const;
export const VOLTAGE_NOMINAL = 220;

export const CHART_H = 220;
export const CHART_H_LG = 240;

export const TOOLTIP_STYLE = {
  background: "#0b0f16",
  border: "1px solid rgba(0, 212, 170, 0.22)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
  fontFamily: '"JetBrains Mono", "Consolas", monospace',
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: "#5eead4",
  fontWeight: 600,
  marginBottom: 4,
} as const;

export const TOOLTIP_ITEM_STYLE = { color: "#e2e8f0" } as const;

export const TOOLTIP_CURSOR = { fill: "rgba(0, 212, 170, 0.06)" } as const;

export const AXIS = {
  stroke: "rgba(255,255,255,0.35)",
  fontSize: 11,
  tickLine: false,
  tick: { fill: "rgba(255,255,255,0.45)", fontFamily: "JetBrains Mono, Consolas, monospace" },
} as const;

export const GRID = {
  strokeDasharray: "3 3",
  stroke: "rgba(0, 212, 170, 0.08)",
} as const;

export const LEGEND = {
  wrapperStyle: { fontSize: 12 },
  iconType: "circle" as const,
  iconSize: 8,
};

export function thdBarColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return CHART_COLORS.load;
  if (value >= THD_THRESHOLDS.danger) return CHART_COLORS.danger;
  return CHART_COLORS.accent;
}

export function fmtChartTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtChartDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}
