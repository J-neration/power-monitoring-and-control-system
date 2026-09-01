"use client";

import {
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "../../lib/chartTheme";
import { QUALITY_REFS } from "../../lib/opsSavings";
import { getPfLevel } from "../../lib/metricThreshold";

export type CompareRingKind = "pf" | "thd" | "unbalance";

type Props = {
  label: string;
  before?: number | null;
  after?: number | null;
  kind?: CompareRingKind;
};

function finite(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function pfColor(v: number): string {
  const level = getPfLevel(Math.abs(v));
  if (level === "danger") return CHART_COLORS.danger;
  if (level === "warn") return CHART_COLORS.warn;
  return CHART_COLORS.accent;
}

function thdColor(v: number): string {
  if (v <= QUALITY_REFS.thdLimitPct) return CHART_COLORS.accent;
  if (v <= 20) return CHART_COLORS.warn;
  return CHART_COLORS.danger;
}

function unbalanceColor(v: number): string {
  if (v <= QUALITY_REFS.voltageUnbalanceMotorPct) return CHART_COLORS.accent;
  if (v <= QUALITY_REFS.voltageUnbalanceLimitPct) return CHART_COLORS.warn;
  return CHART_COLORS.danger;
}

/** PF 0–100, THD 0–25%, 불평형 0–5% 를 게이지 만칸으로 본다. */
function toArc(kind: CompareRingKind, v: number): number {
  const abs = Math.abs(v);
  if (kind === "pf") return Math.min(100, abs);
  if (kind === "thd") return Math.min(100, (abs / 25) * 100);
  return Math.min(100, (abs / 5) * 100);
}

function colorOf(kind: CompareRingKind, v: number): string {
  if (kind === "pf") return pfColor(v);
  if (kind === "thd") return thdColor(v);
  return unbalanceColor(v);
}

export default function CompareRingGauge({
  label,
  before,
  after,
  kind = "pf",
}: Props) {
  const b = finite(before);
  const a = finite(after);

  if (b == null && a == null) {
    return (
      <article className={`ring-gauge ring-gauge--${kind} ring-gauge--empty`}>
        <span className="ring-gauge-title">{label}</span>
        <p className="ring-gauge-muted">데이터 없음</p>
      </article>
    );
  }

  const afterVal = a ?? b ?? 0;
  const beforeVal = b ?? a ?? 0;
  const afterColor = colorOf(kind, Math.abs(afterVal));
  const data = [
    {
      name: "before",
      value: toArc(kind, beforeVal),
      fill: CHART_COLORS.gridMuted,
    },
    { name: "after", value: toArc(kind, afterVal), fill: afterColor },
  ];

  const fmt = (v: number) => `${v.toFixed(1)}%`;

  return (
    <article className={`ring-gauge ring-gauge--${kind}`}>
      <span className="ring-gauge-title">{label}</span>
      <div className="ring-gauge-plot">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="48%"
            outerRadius="98%"
            startAngle={210}
            endAngle={-30}
            data={data}
            barSize={14}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              background={{ fill: "rgba(255,255,255,0.05)" }}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </RadialBar>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="ring-gauge-values">
        <span className="ring-gauge-before">
          {b != null ? fmt(b) : "—"}
        </span>
        <span className="ring-gauge-arrow">→</span>
        <span className="ring-gauge-after" style={{ color: afterColor }}>
          {a != null ? fmt(a) : "—"}
        </span>
      </div>
    </article>
  );
}
