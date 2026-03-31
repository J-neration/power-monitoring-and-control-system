"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
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
};

const CHART_H = 220;
const AXIS = { stroke: "rgba(255,255,255,0.35)", fontSize: 11, tickLine: false } as const;
const GRID = { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.06)" } as const;
const LEG  = { wrapperStyle: { fontSize: 12 }, iconType: "circle" as const, iconSize: 8 };

const fmtUnit = (unit: string) => (v: unknown) => [`${v} ${unit}`] as [string];
const fmtUnitNamed = (unit: string) => (v: unknown, name: unknown) =>
  [`${v} ${unit}`, String(name)] as [string, string];

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

function Grads({ defs }: { defs: { id: string; color: string; opacity?: number }[] }) {
  return (
    <defs>
      {defs.map(({ id, color, opacity = 0.3 }) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={color} stopOpacity={opacity} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      ))}
    </defs>
  );
}

const TEMP_COLORS = ["#F97316", "#EC4899", "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B"];

type SubTab = "pf" | "thd" | "capacity" | "temp";

const SUB_TABS: { key: SubTab; label: string; color: string }[] = [
  { key: "pf",       label: "PF",       color: "#10B981" },
  { key: "thd",      label: "THD",      color: "#F59E0B" },
  { key: "capacity", label: "Capacity", color: "#8B5CF6" },
  { key: "temp",     label: "Temp",     color: "#F97316" },
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
        <p className="history-empty-sub">HMI에서 데이터를 전송하면 여기에 그래프가 표시됩니다.</p>
      </div>
    );
  }

  const capUnit = model === "paf" ? "A" : "kvar";
  const maxAreaSensors  = Math.max(...readings.map((r) => r.areaTemp?.length ?? 0), 0);
  const maxModSensors   = Math.max(...readings.map((r) => r.moduleTemp?.length ?? 0), 0);
  const maxFans         = Math.max(...readings.map((r) => r.fanSpeed?.length ?? 0), 0);

  const data = readings.map((r) => {
    const totalCap = r.totalCapacity ?? null;
    const opCap    = r.operatingCapacity ?? null;
    const rpCap    = r.reactivePowerCapacity ?? null;
    const margin   = r.availableMargin ?? (totalCap != null && opCap != null ? totalCap - opCap : null);
    const idleCap  = opCap != null && rpCap != null ? Math.max(0, opCap - rpCap) : null;
    /** TPF/DPF: API·DB는 퍼센트(0–100) 스케일 */
    const pfPct = (v: number | null | undefined) =>
      v != null ? Math.round(v * 10) / 10 : null;

    const row: Record<string, unknown> = {
      time: fmtTime(r.recordedAt),
      recordedAt: r.recordedAt,
      vL1: r.vL1 ?? null, vL2: r.vL2 ?? null, vL3: r.vL3 ?? null,
      loadCurrentL1: r.loadCurrentL1 ?? null,
      loadCurrentL2: r.loadCurrentL2 ?? null,
      loadCurrentL3: r.loadCurrentL3 ?? null,
      thdBeforeL1: r.loadCurrentTHDL1 ?? null, thdAfterL1: r.gridCurrentTHDL1 ?? null,
      thdBeforeL2: r.loadCurrentTHDL2 ?? null, thdAfterL2: r.gridCurrentTHDL2 ?? null,
      thdBeforeL3: r.loadCurrentTHDL3 ?? null, thdAfterL3: r.gridCurrentTHDL3 ?? null,
      tpfBefore: pfPct(r.tpf1), tpfAfter: pfPct(r.tpf2),
      dpfBefore: pfPct(r.dpf1), dpfAfter: pfPct(r.dpf2),
      sBefore: r.uncompS ?? null, sAfter: r.compS ?? null,
      pBefore: r.uncompP ?? null, pAfter: r.compP ?? null,
      qBefore: r.uncompQ ?? null, qAfter: r.compQ ?? null,
      hBefore: r.uncompH ?? null, hAfter: r.compH ?? null,
      reactive: rpCap, idle: idleCap, margin,
    };

    for (let i = 0; i < maxAreaSensors; i++) {
      row[`area${i}`] = r.areaTemp?.[i] ?? null;
    }
    for (let i = 0; i < maxModSensors; i++) {
      row[`mod${i}`] = r.moduleTemp?.[i] ?? null;
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

      <div className="device-charts-grid">

        {/* ══════════════════════════════════════════════════
            PF — S, P, Q, H, TPF, DPF
           ══════════════════════════════════════════════════ */}
        {subTab === "pf" && (
          <>
            {/* S */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">S (kVA) — Before / After</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
                  <Grads defs={[{ id: "sB", color: "#64748B" }, { id: "sA", color: "#8B5CF6" }]} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kVA" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("kVA")} />
                  <Legend {...LEG} />
                  <Area type="monotone" dataKey="sBefore" name="Before" stroke="#64748B" strokeDasharray="4 3" fill="url(#sB)" dot={false} connectNulls />
                  <Area type="monotone" dataKey="sAfter"  name="After"  stroke="#8B5CF6" fill="url(#sA)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* P */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">P (kW) — Before / After</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
                  <Grads defs={[{ id: "pB", color: "#64748B" }, { id: "pA", color: "#3B82F6" }]} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kW" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("kW")} />
                  <Legend {...LEG} />
                  <Area type="monotone" dataKey="pBefore" name="Before" stroke="#64748B" strokeDasharray="4 3" fill="url(#pB)" dot={false} connectNulls />
                  <Area type="monotone" dataKey="pAfter"  name="After"  stroke="#3B82F6" fill="url(#pA)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Q */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">Q (kvar) — Before / After</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
                  <Grads defs={[{ id: "qB", color: "#64748B" }, { id: "qA", color: "#10B981" }]} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kvar" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("kvar")} />
                  <Legend {...LEG} />
                  <Area type="monotone" dataKey="qBefore" name="Before" stroke="#64748B" strokeDasharray="4 3" fill="url(#qB)" dot={false} connectNulls />
                  <Area type="monotone" dataKey="qAfter"  name="After"  stroke="#10B981" fill="url(#qA)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* H */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">H (kvar) — Before / After</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
                  <Grads defs={[{ id: "hB", color: "#64748B" }, { id: "hA", color: "#F59E0B" }]} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" kvar" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("kvar")} />
                  <Legend {...LEG} />
                  <Area type="monotone" dataKey="hBefore" name="Before" stroke="#64748B" strokeDasharray="4 3" fill="url(#hB)" dot={false} connectNulls />
                  <Area type="monotone" dataKey="hAfter"  name="After"  stroke="#F59E0B" fill="url(#hA)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* TPF */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">TPF (%) — Before / After</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <Grads defs={[{ id: "tpfB", color: "#64748B" }, { id: "tpfA", color: "#10B981" }]} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("%")} />
                  <Legend {...LEG} />
                  <Area type="monotone" dataKey="tpfBefore" name="Before" stroke="#64748B" strokeDasharray="4 3" fill="url(#tpfB)" dot={false} connectNulls />
                  <Area type="monotone" dataKey="tpfAfter"  name="After"  stroke="#10B981" fill="url(#tpfA)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* DPF */}
            <div className="chart-card chart-card-wide">
              <h3 className="chart-title">DPF (%) — Before / After</h3>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <Grads defs={[{ id: "dpfB", color: "#64748B" }, { id: "dpfA", color: "#6366F1" }]} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("%")} />
                  <Legend {...LEG} />
                  <Area type="monotone" dataKey="dpfBefore" name="Before" stroke="#64748B" strokeDasharray="4 3" fill="url(#dpfB)" dot={false} connectNulls />
                  <Area type="monotone" dataKey="dpfAfter"  name="After"  stroke="#6366F1" fill="url(#dpfA)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            THD
           ══════════════════════════════════════════════════ */}
        {subTab === "thd" && (
          <div className="chart-card chart-card-wide">
            <h3 className="chart-title">
              Current THD (%) — Before / After
              <span className="chart-title-sub">last {hours}h</span>
            </h3>
            <ResponsiveContainer width="100%" height={CHART_H + 40}>
              <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <Grads defs={[
                  { id: "tB1", color: "#3B82F6", opacity: 0.18 },
                  { id: "tA1", color: "#3B82F6", opacity: 0.35 },
                  { id: "tB2", color: "#F59E0B", opacity: 0.18 },
                  { id: "tA2", color: "#F59E0B", opacity: 0.35 },
                  { id: "tB3", color: "#EC4899", opacity: 0.18 },
                  { id: "tA3", color: "#EC4899", opacity: 0.35 },
                ]} />
                <CartesianGrid {...GRID} />
                    <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                <YAxis {...AXIS} domain={["auto", "auto"]} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("%")} />
                <Legend {...LEG} />
                <Area type="monotone" dataKey="thdBeforeL1" name="L1 Before" stroke="#3B82F6" strokeDasharray="4 3" strokeOpacity={0.6} fill="url(#tB1)" dot={false} connectNulls />
                <Area type="monotone" dataKey="thdAfterL1"  name="L1 After"  stroke="#3B82F6" fill="url(#tA1)" dot={false} connectNulls />
                <Area type="monotone" dataKey="thdBeforeL2" name="L2 Before" stroke="#F59E0B" strokeDasharray="4 3" strokeOpacity={0.6} fill="url(#tB2)" dot={false} connectNulls />
                <Area type="monotone" dataKey="thdAfterL2"  name="L2 After"  stroke="#F59E0B" fill="url(#tA2)" dot={false} connectNulls />
                <Area type="monotone" dataKey="thdBeforeL3" name="L3 Before" stroke="#EC4899" strokeDasharray="4 3" strokeOpacity={0.6} fill="url(#tB3)" dot={false} connectNulls />
                <Area type="monotone" dataKey="thdAfterL3"  name="L3 After"  stroke="#EC4899" fill="url(#tA3)" dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
                  <AreaChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
                    <Grads defs={[
                      { id: "capR", color: "#10B981", opacity: 0.5 },
                      { id: "capI", color: "#3B82F6", opacity: 0.4 },
                      { id: "capM", color: "#475569", opacity: 0.35 },
                    ]} />
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                    <YAxis {...AXIS} unit={` ${capUnit}`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnitNamed(capUnit)} />
                    <Legend {...LEG} />
                    <Area type="monotone" dataKey="reactive" name="Reactive Power Output" stackId="cap" stroke="#10B981" fill="url(#capR)" dot={false} connectNulls />
                    <Area type="monotone" dataKey="idle"     name="Operating Reserve"     stackId="cap" stroke="#3B82F6" fill="url(#capI)" dot={false} connectNulls />
                    <Area type="monotone" dataKey="margin"   name="Available Margin"      stackId="cap" stroke="#64748B" fill="url(#capM)" dot={false} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="capacity-legend-row">
                  <span className="cap-badge cap-reactive">Reactive Power Output</span>
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
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <Grads defs={Array.from({ length: maxAreaSensors }, (_, i) => ({
                    id: `ga${i}`, color: TEMP_COLORS[i % TEMP_COLORS.length],
                  }))} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit="°C" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("°C")} />
                  <Legend {...LEG} />
                  <ReferenceLine y={38} stroke="#EF4444" strokeDasharray="4 3" label={{ value: "38°C", fill: "#EF4444", fontSize: 10 }} />
                  {Array.from({ length: maxAreaSensors }, (_, i) => (
                    <Area key={i} type="monotone" dataKey={`area${i}`} name={`Zone ${i + 1}`}
                      stroke={TEMP_COLORS[i % TEMP_COLORS.length]}
                      fill={`url(#ga${i})`} dot={false} connectNulls />
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
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <Grads defs={Array.from({ length: maxModSensors }, (_, i) => ({
                    id: `gm${i}`, color: TEMP_COLORS[i % TEMP_COLORS.length],
                  }))} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit="°C" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("°C")} />
                  <Legend {...LEG} />
                  <ReferenceLine y={100} stroke="#EF4444" strokeDasharray="4 3" label={{ value: "100°C", fill: "#EF4444", fontSize: 10 }} />
                  {Array.from({ length: maxModSensors }, (_, i) => (
                    <Area key={i} type="monotone" dataKey={`mod${i}`} name={`Mod ${i + 1}`}
                      stroke={TEMP_COLORS[i % TEMP_COLORS.length]}
                      fill={`url(#gm${i})`} dot={false} connectNulls />
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
                <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <Grads defs={Array.from({ length: maxFans }, (_, i) => ({
                    id: `gf${i}`, color: TEMP_COLORS[i % TEMP_COLORS.length],
                  }))} />
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="time" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} domain={["auto", "auto"]} unit=" m/s" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtUnit("m/s")} />
                  <Legend {...LEG} />
                  {Array.from({ length: maxFans }, (_, i) => (
                    <Area key={i} type="monotone" dataKey={`fan${i}`} name={`Fan ${i + 1}`}
                      stroke={TEMP_COLORS[i % TEMP_COLORS.length]}
                      fill={`url(#gf${i})`} dot={false} connectNulls />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

      </div>

      {dataDateLabel ? (
        <p className="history-data-date-line" aria-label="데이터 기준 날짜">
          {dataDateLabel}
        </p>
      ) : null}
    </>
  );
}
