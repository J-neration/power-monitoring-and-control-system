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
  height?: number | string;
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
  let max = QUALITY_REFS.voltageUnbalanceLimitPct;
  for (const row of data) {
    for (const key of keys) {
      const v = row[key];
      if (v != null && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
    }
  }
  const pad = Math.max(max * 1.15, 1.5);
  return [-pad, pad];
}

export default function UnbalanceDeviationChart({
  data,
  series,
  height = "100%",
  colorByLimit = false,
}: Props) {
  const keys = series.map((s) => s.key);
  const domain = domainOf(data, keys);
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
          type="number"
          domain={domain}
          {...AXIS}
          tickFormatter={(v: number) => `${v}%`}
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
          formatter={(value, name) => [
            typeof value === "number" ? `${value.toFixed(2)}%` : String(value ?? ""),
            name,
          ]}
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
