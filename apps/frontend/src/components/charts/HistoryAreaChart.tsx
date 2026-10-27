"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ScadaTooltip from "./ScadaTooltip";
import FaultChartMarkers from "./FaultChartMarkers";
import type { FaultEvent } from "../../lib/api";
import {
  AXIS,
  CHART_H,
  GRID,
  withChartUnit,
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
  dash?: string;
  stackId?: string;
};

type Props = {
  data: Record<string, unknown>[];
  series: Series[];
  grads: GradDef[];
  yUnit?: string;
  yDomain?: [number | string, number | string];
  yAxisWidth?: number;
  faults?: FaultEvent[];
  children?: ReactNode;
  margin?: { top?: number; right?: number; left?: number; bottom?: number };
};

/** 축 눈금은 최대 소수 둘째 자리. 부동소수 노이즈로 라벨이 길어지지 않게 한다. */
function formatAxisTick(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(2)));
}

function chartHasFiniteY(
  data: Record<string, unknown>[],
  series: Series[],
): boolean {
  for (const item of series) {
    for (const row of data) {
      const value = row[item.dataKey];
      if (typeof value === "number" && Number.isFinite(value)) return true;
    }
  }
  return false;
}

/**
 * 숫자 값이 없으면 Recharts 3은 allowDataOverflow가 꺼져 있을 때
 * 지정한 domain도 버리고 Y축 너비를 0으로 만든다. 첫 X 라벨이 그때 잘린다.
 * auto 축은 빈 눈금이 보이도록 0–10으로 둔다.
 */
function domainWhenEmpty(
  domain: [number | string, number | string],
): [number, number] {
  const min =
    typeof domain[0] === "number" && Number.isFinite(domain[0]) ? domain[0] : 0;
  const max =
    typeof domain[1] === "number" && Number.isFinite(domain[1])
      ? domain[1]
      : min + 10;
  return max > min ? [min, max] : [min, min + 10];
}

/**
 * "10-27 08:00"은 눈금 가운데에 붙는다. 오른쪽 절반이 SVG 밖으로 나가
 * 08:00이 잘리지 않도록 끝 여백을 라벨 너비의 절반보다 크게 둔다.
 */
const X_END_LABEL_MARGIN = 72;

/** 24시간 이력에서 시작·끝을 포함해 약 6개만 표시 (4시간 간격) */
function historyTimeTicks(data: Record<string, unknown>[]): string[] {
  const times = data.map((d) => String(d.time ?? ""));
  const n = times.length;
  if (n === 0) return [];
  const count = Math.min(6, n);
  if (count === 1) return [times[0]];
  const last = n - 1;
  const idxs: number[] = [];
  for (let i = 0; i < count; i++) {
    idxs.push(Math.round((i * last) / (count - 1)));
  }
  return [...new Set(idxs)].map((i) => times[i]);
}

export default function HistoryAreaChart({
  data,
  series,
  grads,
  yUnit,
  yDomain = ["auto", "auto"],
  yAxisWidth,
  faults = [],
  children,
  margin,
}: Props) {
  const xTicks = historyTimeTicks(data);
  const hasYValues = chartHasFiniteY(data, series);
  const resolvedDomain = hasYValues ? yDomain : domainWhenEmpty(yDomain);
  const chartMargin = {
    top: margin?.top ?? 8,
    right: Math.max(margin?.right ?? 0, X_END_LABEL_MARGIN),
    left: (margin?.left ?? 0) + (hasYValues ? 0 : 10),
    bottom: margin?.bottom ?? 12,
  };

  return (
    <div className="history-area-chart">
    <ResponsiveContainer width="100%" height={CHART_H}>
      <AreaChart data={data} margin={chartMargin}>
        <Grads defs={grads} />
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="time"
          {...AXIS}
          ticks={xTicks}
          interval={0}
          minTickGap={24}
          tickMargin={8}
          padding={hasYValues ? undefined : { left: 36, right: 20 }}
          tick={{ ...AXIS.tick, className: "tabular-nums" }}
        />
        <YAxis
          {...AXIS}
          width={yAxisWidth ?? "auto"}
          domain={resolvedDomain}
          allowDataOverflow={!hasYValues}
          tickFormatter={(v) => withChartUnit(formatAxisTick(v), yUnit)}
          tick={{ ...AXIS.tick, className: "tabular-nums" }}
        />
        <Tooltip content={<ScadaTooltip unit={yUnit} />} />
        <FaultChartMarkers faults={faults} data={data as { time: string; recordedAt: string }[]} />
        {children}
        {series.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.stroke}
            strokeDasharray={s.dash ?? (s.dashed ? "4 3" : undefined)}
            fill={s.fill}
            dot={false}
            connectNulls={false}
            stackId={s.stackId}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
      {series.length > 0 ? (
        <ul className="history-chart-legend">
          {series.map((s) => (
            <li key={s.dataKey}>
              <span
                className={`history-chart-legend-swatch${s.dashed ? " is-dashed" : ""}`}
                style={{ background: s.stroke }}
                aria-hidden
              />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
