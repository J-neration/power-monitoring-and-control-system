"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ScadaTooltip from "./ScadaTooltip";
import FaultChartMarkers from "./FaultChartMarkers";
import ChartThresholdLines from "./ChartThresholdLines";
import type { FaultEvent } from "../../lib/api";
import {
  AXIS,
  CHART_H,
  GRID,
  LEGEND,
} from "../../lib/chartTheme";

type GradDef = { id: string; color: string; opacity?: number };

function Grads({ defs }: { defs: GradDef[] }) {
  return (
    <defs>
      {defs.map(({ id, color, opacity = 0.3 }) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={opacity} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      ))}
    </defs>
  );
}

type Series = {
  dataKey: string;
  name: string;
  stroke: string;
  fill: string;
  dashed?: boolean;
  stackId?: string;
};

type Props = {
  data: Record<string, unknown>[];
  series: Series[];
  grads: GradDef[];
  yUnit?: string;
  yDomain?: [number | string, number | string];
  threshold?: "thd" | "pf";
  faults?: FaultEvent[];
  brush?: boolean;
  onBrushChange?: (range: { startIndex?: number; endIndex?: number }) => void;
  children?: ReactNode;
};

export default function HistoryAreaChart({
  data,
  series,
  grads,
  yUnit,
  yDomain = ["auto", "auto"],
  threshold,
  faults = [],
  brush,
  onBrushChange,
  children,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 16, left: -4, bottom: brush ? 20 : 0 }}
      >
        <Grads defs={grads} />
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="time"
          {...AXIS}
          interval="preserveStartEnd"
          tick={{ ...AXIS.tick, className: "tabular-nums" }}
        />
        <YAxis
          {...AXIS}
          domain={yDomain}
          unit={yUnit}
          tick={{ ...AXIS.tick, className: "tabular-nums" }}
        />
        <Tooltip content={<ScadaTooltip />} />
        <Legend {...LEGEND} />
        {threshold ? <ChartThresholdLines kind={threshold} /> : null}
        <FaultChartMarkers faults={faults} data={data as { time: string; recordedAt: string }[]} />
        {children}
        {series.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.stroke}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            fill={s.fill}
            dot={false}
            connectNulls={false}
            stackId={s.stackId}
          />
        ))}
        {brush && onBrushChange ? (
          <Brush
            dataKey="time"
            height={22}
            stroke="#00d4aa"
            fill="rgba(0, 212, 170, 0.08)"
            travellerWidth={8}
            onChange={(range) =>
              onBrushChange(range as { startIndex?: number; endIndex?: number })
            }
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}
