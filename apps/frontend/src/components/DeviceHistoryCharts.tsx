"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { TelemetryReading } from "../types/site";

const TOOLTIP_STYLE = {
  background: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};
const TOOLTIP_LABEL_STYLE = { color: "#e2e8f0" };
const TOOLTIP_ITEM_STYLE = { color: "#e2e8f0" };

const CHART_H = 220;
const AXIS = {
  stroke: "rgba(255,255,255,0.35)",
  fontSize: 11,
  tickLine: false,
} as const;
const GRID = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.06)",
} as const;
const LEG = {
  wrapperStyle: { fontSize: 12 },
  iconType: "circle" as const,
  iconSize: 8,
};

const fmtUnit = (unit: string) => (v: unknown, name: unknown) =>
  [`${v} ${unit}`, String(name)] as [string, string];
const fmtUnitNamed = (unit: string) => (v: unknown, name: unknown) =>
  [`${typeof v === "number" ? v.toFixed(2) : v} ${unit}`, String(name)] as [
    string,
    string,
  ];

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 그래프 하단 1줄용: 2026.03.31 (범위가 나뉘면 2026.03.31 – 2026.04.01) */
function formatDataDateRangeLabel(readings: TelemetryReading[]): string {
  let minT = Infinity;
  let maxT = -Infinity;
  for (const r of readings) {
    const t = new Date(r.recordedAt).getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  if (!Number.isFinite(minT)) return "";
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const a = fmt(new Date(minT));
  const b = fmt(new Date(maxT));
  return a === b ? a : `${a} – ${b}`;
}

function Grads({
  defs,
}: {
  defs: { id: string; color: string; opacity?: number }[];
}) {
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

const TEMP_COLORS = [
  "#F97316",
  "#EC4899",
  "#8B5CF6",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
];

type SubTab = "pf" | "thd" | "capacity" | "temp";

const SUB_TABS: { key: SubTab; label: string; color: string }[] = [
  { key: "pf", label: "PF", color: "#10B981" },
  { key: "thd", label: "THD", color: "#F59E0B" },
  { key: "capacity", label: "Capacity", color: "#8B5CF6" },
  { key: "temp", label: "Temp", color: "#F97316" },
];

type Props = {
  readings: TelemetryReading[];
  hours: number;
  model?: string;
};

export default function DeviceHistoryCharts({ readings, hours, model }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("pf");

  if (readings.length === 0) {
    return (
      <div className="chart-card chart-card-wide history-empty">
        <p>최근 {hours}시간 수신된 데이터가 없습니다.</p>
        <p className="history-empty-sub">
          HMI에서 데이터를 전송하면 여기에 그래프가 표시됩니다.
        </p>
      </div>
    );
  }

  const capUnit = model === "paf" ? "A" : "kvar";
  const maxAreaSensors = Math.max(
    ...readings.map((r) => r.areaTemp?.length ?? 0),
    0,
  );
  const maxModSensors = Math.max(
    ...readings.map((r) => r.moduleTemp?.length ?? 0),
    0,
  );
  const maxFans = Math.max(...readings.map((r) => r.fanSpeed?.length ?? 0), 0);

  const data = readings.map((r) => {
    const totalCap = r.totalCapacity ?? null;
    const opCap = r.operatingCapacity ?? null;
    const rpCap = r.reactivePowerCapacity ?? null;
    const margin =
      r.availableMargin ??
      (totalCap != null && opCap != null ? totalCap - opCap : null);
    const idleCap =
      opCap != null && rpCap != null ? Math.max(0, opCap - rpCap) : null;
    /** TPF/DPF: API·DB는 퍼센트(0–100) 스케일 */
    const pfPct = (v: number | null | undefined) =>
      v != null ? Math.round(v * 10) / 10 : null;

    const row: Record<string, unknown> = {
      time: fmtTime(r.recordedAt),
      recordedAt: r.recordedAt,
      vL1: r.vL1 ?? null,
      vL2: r.vL2 ?? null,
      vL3: r.vL3 ?? null,
      loadCurrentL1: r.loadCurrentL1 ?? null,
      loadCurrentL2: r.loadCurrentL2 ?? null,
      loadCurrentL3: r.loadCurrentL3 ?? null,
      thdBeforeL1: r.loadCurrentTHDL1 ?? null,
      thdAfterL1: r.gridCurrentTHDL1 ?? null,
      thdBeforeL2: r.loadCurrentTHDL2 ?? null,
      thdAfterL2: r.gridCurrentTHDL2 ?? null,
      thdBeforeL3: r.loadCurrentTHDL3 ?? null,
      thdAfterL3: r.gridCurrentTHDL3 ?? null,
      tpfBefore: pfPct(r.tpf1),
      tpfAfter: pfPct(r.tpf2),
      dpfBefore: pfPct(r.dpf1),
      dpfAfter: pfPct(r.dpf2),
      sBefore: r.uncompS ?? null,
      sAfter: r.compS ?? null,
      pBefore: r.uncompP ?? null,
      pAfter: r.compP ?? null,
      qBefore: r.uncompQ ?? null,
      qAfter: r.compQ ?? null,
      hBefore: r.uncompH ?? null,
      hAfter: r.compH ?? null,
      reactive: rpCap,
      idle: idleCap,
      margin,
    };

    for (let i = 0; i < maxAreaSensors; i++) {
      row[`area${i}`] = r.areaTemp?.[i] ?? null;
    }
    for (let i = 0; i < maxModSensors; i++) {
      const modVal = r.moduleTemp?.[i] ?? null;
      row[`mod${i}`] = modVal != null && modVal >= 0 ? modVal : null;
    }
    for (let i = 0; i < maxFans; i++) {
      row[`fan${i}`] = r.fanSpeed?.[i] ?? null;
    }

    return row;
  });

  const hasCapData = data.some((d) => d.reactive != null || d.idle != null);
  const dataDateLabel = formatDataDateRangeLabel(readings);

  return (
    <>
      {/* ── Sub-tab bar ─────────────────────────────────── */}
      <div className="analytics-subtab-bar">
        {SUB_TABS.map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            className={`analytics-subtab${subTab === key ? " active" : ""}`}
            style={{ "--tab-accent": color } as React.CSSProperties}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {dataDateLabel ? (
        <p className="history-data-date-line" aria-label="데이터 기준 날짜">
          {dataDateLabel}
        </p>
      ) : null}
      <div className="device-charts-grid">
        {/* ══════════════════════════════════════════════════
            PF — S, P, Q, H, TPF, DPF
           ══════════════════════════════════════════════════ */}
        {subTab === "pf" && (
          <>
            {/* S */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">S (kVA) — 보상 전 / 후</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -4, bottom: 0 }}
                >
                  <Grads
                    defs={[
                      { id: "sB", color: "#64748B" },
                      { id: "sA", color: "#8B5CF6" },
                    ]}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kVA" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("kVA")}
                  />
                  <Legend {...LEG} />
                  <Area
                    type="monotone"
                    dataKey="sBefore"
                    name="보상 전"
                    stroke="#64748B"
                    strokeDasharray="4 3"
                    fill="url(#sB)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="sAfter"
                    name="보상 후"
                    stroke="#8B5CF6"
                    fill="url(#sA)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* P */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">P (kW) — 보상 전 / 후</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -4, bottom: 0 }}
                >
                  <Grads
                    defs={[
                      { id: "pB", color: "#64748B" },
                      { id: "pA", color: "#3B82F6" },
                    ]}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kW" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("kW")}
                  />
                  <Legend {...LEG} />
                  <Area
                    type="monotone"
                    dataKey="pBefore"
                    name="보상 전"
                    stroke="#64748B"
                    strokeDasharray="4 3"
                    fill="url(#pB)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="pAfter"
                    name="보상 후"
                    stroke="#3B82F6"
                    fill="url(#pA)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Q */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">Q (kvar) — 보상 전 / 후</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -4, bottom: 0 }}
                >
                  <Grads
                    defs={[
                      { id: "qB", color: "#64748B" },
                      { id: "qA", color: "#10B981" },
                    ]}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kvar" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("kvar")}
                  />
                  <Legend {...LEG} />
                  <Area
                    type="monotone"
                    dataKey="qBefore"
                    name="보상 전"
                    stroke="#64748B"
                    strokeDasharray="4 3"
                    fill="url(#qB)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="qAfter"
                    name="보상 후"
                    stroke="#10B981"
                    fill="url(#qA)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* H */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">H (kvar) — 보상 전 / 후</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -4, bottom: 0 }}
                >
                  <Grads
                    defs={[
                      { id: "hB", color: "#64748B" },
                      { id: "hA", color: "#F59E0B" },
                    ]}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kvar" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("kvar")}
                  />
                  <Legend {...LEG} />
                  <Area
                    type="monotone"
                    dataKey="hBefore"
                    name="보상 전"
                    stroke="#64748B"
                    strokeDasharray="4 3"
                    fill="url(#hB)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="hAfter"
                    name="보상 후"
                    stroke="#F59E0B"
                    fill="url(#hA)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* TPF */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">TPF (%) — 보상 전 / 후</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                >
                  <Grads
                    defs={[
                      { id: "tpfB", color: "#64748B" },
                      { id: "tpfA", color: "#10B981" },
                    ]}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit="%" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("%")}
                  />
                  <Legend {...LEG} />
                  <Area
                    type="monotone"
                    dataKey="tpfBefore"
                    name="보상 전"
                    stroke="#64748B"
                    strokeDasharray="4 3"
                    fill="url(#tpfB)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="tpfAfter"
                    name="보상 후"
                    stroke="#10B981"
                    fill="url(#tpfA)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* DPF */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">DPF (%) — 보상 전 / 후</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                >
                  <Grads
                    defs={[
                      { id: "dpfB", color: "#64748B" },
                      { id: "dpfA", color: "#6366F1" },
                    ]}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit="%" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("%")}
                  />
                  <Legend {...LEG} />
                  <Area
                    type="monotone"
                    dataKey="dpfBefore"
                    name="보상 전"
                    stroke="#64748B"
                    strokeDasharray="4 3"
                    fill="url(#dpfB)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="dpfAfter"
                    name="보상 후"
                    stroke="#6366F1"
                    fill="url(#dpfA)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            THD
           ══════════════════════════════════════════════════ */}
        {subTab === "thd" && (
          <>
            {(["L1", "L2", "L3"] as const).map((phase, idx) => {
              const colors = ["#3B82F6", "#F59E0B", "#EC4899"];
              const color = colors[idx];
              const gradB = `thdB${phase}`;
              const gradA = `thdA${phase}`;
              return (
                <div key={phase} className="chart-card chart-card-wide">
                  <h3 className="chart-title">
                    {phase} 전류 THD (%) — 보상 전 / 후
                    <span className="chart-title-sub">last {hours}h</span>
                  </h3>
                  <ResponsiveContainer width="100%" height={CHART_H}>
                    <AreaChart
                      data={data}
                      margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                    >
                      <Grads
                        defs={[
                          { id: gradB, color: "#64748B", opacity: 0.2 },
                          { id: gradA, color, opacity: 0.35 },
                        ]}
                      />
                      <CartesianGrid {...GRID} />
                      <XAxis
                        dataKey="time"
                        {...AXIS}
                        interval="preserveStartEnd"
                      />
                      <YAxis {...AXIS} domain={["auto", "auto"]} unit="%" />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        formatter={fmtUnit("%")}
                      />
                      <Legend {...LEG} />
                      <Area
                        type="monotone"
                        dataKey={`thdBefore${phase}`}
                        name="보상 전"
                        stroke="#64748B"
                        strokeDasharray="4 3"
                        fill={`url(#${gradB})`}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Area
                        type="monotone"
                        dataKey={`thdAfter${phase}`}
                        name="보상 후"
                        stroke={color}
                        fill={`url(#${gradA})`}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </>
        )}

        {/* ══════════════════════════════════════════════════
            Capacity
           ══════════════════════════════════════════════════ */}
        {subTab === "capacity" && (
          <>
            {hasCapData ? (
              <div className="chart-card chart-card-wide">
                <h3 className="chart-title">
                  Capacity Trend ({capUnit})
                  <span className="chart-title-sub">last {hours}h</span>
                </h3>
                <ResponsiveContainer width="100%" height={CHART_H + 20}>
                  <AreaChart
                    data={data}
                    margin={{ top: 8, right: 16, left: -4, bottom: 0 }}
                  >
                    <Grads
                      defs={[
                        { id: "capR", color: "#10B981", opacity: 0.5 },
                        { id: "capI", color: "#3B82F6", opacity: 0.4 },
                        { id: "capM", color: "#475569", opacity: 0.35 },
                      ]}
                    />
                    <CartesianGrid {...GRID} />
                    <XAxis
                      dataKey="time"
                      {...AXIS}
                      interval="preserveStartEnd"
                    />
                    <YAxis {...AXIS} unit={` ${capUnit}`} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      formatter={fmtUnitNamed(capUnit)}
                    />
                    <Legend {...LEG} />
                    <Area
                      type="monotone"
                      dataKey="reactive"
                      name="무효 전력"
                      stackId="cap"
                      stroke="#10B981"
                      fill="url(#capR)"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                    <Area
                      type="monotone"
                      dataKey="idle"
                      name="운전 용량"
                      stackId="cap"
                      stroke="#3B82F6"
                      fill="url(#capI)"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                    <Area
                      type="monotone"
                      dataKey="margin"
                      name="가용 여유"
                      stackId="cap"
                      stroke="#64748B"
                      fill="url(#capM)"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="capacity-legend-row">
                  <span className="cap-badge cap-reactive">
                    Reactive Power Output
                  </span>
                  <span className="cap-badge cap-idle">Operating Reserve</span>
                  <span className="cap-badge cap-margin">Available Margin</span>
                </div>
              </div>
            ) : (
              <div className="chart-card chart-card-wide history-empty">
                <p>용량 데이터가 없습니다.</p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════
            Temp — Area Temp / Module Temp / Fan Speed
           ══════════════════════════════════════════════════ */}
        {subTab === "temp" && (
          <>
            {/* Area Temperature */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">
                Area Temperature (°C)
                <span className="chart-title-sub">last {hours}h</span>
              </h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                >
                  <Grads
                    defs={Array.from({ length: maxAreaSensors }, (_, i) => ({
                      id: `ga${i}`,
                      color: TEMP_COLORS[i % TEMP_COLORS.length],
                    }))}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={[0, 50]} unit="°C" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("°C")}
                  />
                  <Legend {...LEG} />
                  <ReferenceLine
                    y={30}
                    stroke="#F97316"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                      value: "35°C",
                      fill: "#F97316",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                  <ReferenceLine
                    y={38}
                    stroke="#EF4444"
                    strokeDasharray="4 3"
                    label={{
                      value: "40°C",
                      fill: "#EF4444",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                  {Array.from({ length: maxAreaSensors }, (_, i) => (
                    <Area
                      key={i}
                      type="monotone"
                      dataKey={`area${i}`}
                      name={`Zone ${i + 1}`}
                      stroke={TEMP_COLORS[i % TEMP_COLORS.length]}
                      fill={`url(#ga${i})`}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Module Temperature */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">
                Module Temperature (°C)
                <span className="chart-title-sub">last {hours}h</span>
              </h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                >
                  <Grads
                    defs={Array.from({ length: maxModSensors }, (_, i) => ({
                      id: `gm${i}`,
                      color: TEMP_COLORS[i % TEMP_COLORS.length],
                    }))}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={[0, 150]} unit="°C" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("°C")}
                  />
                  <Legend {...LEG} />
                  <ReferenceLine
                    y={40}
                    stroke="#FACC15"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                      value: "40°C",
                      fill: "#FACC15",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                  <ReferenceLine
                    y={90}
                    stroke="#EF4444"
                    strokeDasharray="4 3"
                    label={{
                      value: "90°C",
                      fill: "#EF4444",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                  {Array.from({ length: maxModSensors }, (_, i) => (
                    <Area
                      key={i}
                      type="monotone"
                      dataKey={`mod${i}`}
                      name={`Mod ${i + 1}`}
                      stroke={TEMP_COLORS[i % TEMP_COLORS.length]}
                      fill={`url(#gm${i})`}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Fan Speed */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">
                Fan Speed (m/s)
                <span className="chart-title-sub">last {hours}h</span>
              </h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
                >
                  <Grads
                    defs={Array.from({ length: maxFans }, (_, i) => ({
                      id: `gf${i}`,
                      color: TEMP_COLORS[i % TEMP_COLORS.length],
                    }))}
                  />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" m/s" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={fmtUnit("m/s")}
                  />
                  <Legend {...LEG} />
                  {Array.from({ length: maxFans }, (_, i) => (
                    <Area
                      key={i}
                      type="monotone"
                      dataKey={`fan${i}`}
                      name={`Fan ${i + 1}`}
                      stroke={TEMP_COLORS[i % TEMP_COLORS.length]}
                      fill={`url(#gf${i})`}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </>
  );
}
