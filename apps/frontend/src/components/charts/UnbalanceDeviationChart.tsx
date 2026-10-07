"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS,
  CHART_COLORS,
  GRID,
  TOOLTIP_CURSOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "../../lib/chartTheme";
import { QUALITY_REFS } from "../../lib/opsSavings";

export type DeviationRow = {
  phase: string;
  보상전?: number | null;
  보상후?: number | null;
  편차?: number | null;
};

type SeriesKey = "보상전" | "보상후" | "편차";

type Props = {
  data: DeviationRow[];
  series: { key: SeriesKey; name: string; color: string }[];
  height?: number | `${number}%`;
  colorByLimit?: boolean;
};

function toneColor(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return CHART_COLORS.gridMuted;
  const abs = Math.abs(pct);
  if (abs >= QUALITY_REFS.voltageUnbalanceLimitPct) return CHART_COLORS.danger;
  if (abs >= QUALITY_REFS.voltageUnbalanceMotorPct) return CHART_COLORS.warn;
  return CHART_COLORS.accent;
}

function domainOf(data: DeviationRow[], keys: SeriesKey[]): [number, number] {
  let max: number = QUALITY_REFS.voltageUnbalanceLimitPct;
  for (const row of data) {
    for (const key of keys) {
      const v = row[key];
      if (v != null && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
    }
  }
  const pad = Math.max(max * 1.15, 1.5);
  const limit = Math.ceil(pad);
  return [-limit, limit];
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const n = numericValue(value[i]);
      if (n != null) return n;
    }
    return null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatPct(value: unknown): string {
  const n = numericValue(value);
  if (n == null) return "";
  const rounded = Number(n.toFixed(2));
  if (rounded === 0) return "0%";
  return `${rounded}%`;
}

function percentTicks(domain: [number, number]): number[] {
  const span = Math.max(Math.abs(domain[0]), Math.abs(domain[1]), 1);
  const step = span <= 5 ? 1 : span <= 10 ? 2 : 5;
  const limit = Math.ceil(span / step) * step;
  const ticks: number[] = [];
  for (let v = -limit; v <= limit; v += step) ticks.push(v);
  return ticks;
}

export default function UnbalanceDeviationChart({
  data,
  series,
  height = "100%",
  colorByLimit = false,
}: Props) {
  const keys = series.map((s) => s.key);
  const domain = domainOf(data, keys);
  const ticks = percentTicks(domain);
  const motor = QUALITY_REFS.voltageUnbalanceMotorPct;
  const limit = QUALITY_REFS.voltageUnbalanceLimitPct;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
      >
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis
          {...AXIS}
          type="number"
          domain={domain}
          ticks={ticks}
          tickFormatter={(v: number) => formatPct(v)}
          tick={{ ...AXIS.tick, className: "tabular-nums" }}
        />
        <YAxis
          type="category"
          dataKey="phase"
          {...AXIS}
          width={36}
          tick={{ ...AXIS.tick, fontWeight: 700 }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={TOOLTIP_CURSOR}
          formatter={(value, name) => [formatPct(value), name]}
        />
        <ReferenceLine x={0} stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} />
        <ReferenceLine
          x={motor}
          stroke={CHART_COLORS.warn}
          strokeDasharray="4 3"
          strokeOpacity={0.7}
        />
        <ReferenceLine
          x={-motor}
          stroke={CHART_COLORS.warn}
          strokeDasharray="4 3"
          strokeOpacity={0.7}
        />
        <ReferenceLine
          x={limit}
          stroke={CHART_COLORS.danger}
          strokeDasharray="4 3"
          strokeOpacity={0.55}
        />
        <ReferenceLine
          x={-limit}
          stroke={CHART_COLORS.danger}
          strokeDasharray="4 3"
          strokeOpacity={0.55}
        />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color}
            radius={3}
            barSize={series.length > 1 ? 12 : 18}
            maxBarSize={22}
          >
            {colorByLimit
              ? data.map((row) => (
                  <Cell key={`${s.key}-${row.phase}`} fill={toneColor(row[s.key])} />
                ))
              : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
