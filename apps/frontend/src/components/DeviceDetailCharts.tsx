"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadialBarChart,
  RadialBar,
  Cell,
} from "recharts";
import type { Device } from "../types/site";

function moduleStatusClass(s: number) {
  if (s === 2) return "running";
  if (s === 3) return "fault";
  if (s === 1) return "standby";
  return "offline";
}

const TOOLTIP_STYLE = {
  background: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 12,
};

const CHART_H = 240;

function PfGauge({ label, before, after }: { label: string; before?: number | null; after?: number | null }) {
  const bPct = before != null ? Math.round(before * 1000) / 10 : 0;
  const aPct = after != null ? Math.round(after * 1000) / 10 : 0;
  const improved = aPct >= bPct;

  const data = [
    { name: "보상 후", value: aPct, fill: improved ? "#10B981" : "#EF4444" },
    { name: "보상 전", value: bPct, fill: "#374151" },
  ];

  return (
    <div className="pf-gauge">
      <ResponsiveContainer width="100%" height={140}>
        <RadialBarChart
          innerRadius="60%"
          outerRadius="90%"
          startAngle={180}
          endAngle={0}
          data={data}
          barSize={10}
        >
          <RadialBar dataKey="value" cornerRadius={5} background={{ fill: "rgba(255,255,255,0.04)" }}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </RadialBar>
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pf-gauge-labels">
        <span className="pf-gauge-title">{label}</span>
        <div className="pf-gauge-values">
          <span className="pf-gauge-before">{bPct.toFixed(1)}%</span>
          <span className="pf-gauge-arrow">→</span>
          <span className="pf-gauge-after" style={{ color: improved ? "#10B981" : "#EF4444" }}>
            {aPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DeviceDetailCharts({ device }: { device: Device }) {
  const voltageData = [
    { phase: "L1", 전압: Math.round((device.vL1 ?? 0) * 10) / 10 },
    { phase: "L2", 전압: Math.round((device.vL2 ?? 0) * 10) / 10 },
    { phase: "L3", 전압: Math.round((device.vL3 ?? 0) * 10) / 10 },
  ];

  const currentData = [
    {
      phase: "L1",
      부하: Math.round((device.loadCurrentL1 ?? 0) * 10) / 10,
      계통: Math.round((device.gridCurrentL1 ?? 0) * 10) / 10,
    },
    {
      phase: "L2",
      부하: Math.round((device.loadCurrentL2 ?? 0) * 10) / 10,
      계통: Math.round((device.gridCurrentL2 ?? 0) * 10) / 10,
    },
    {
      phase: "L3",
      부하: Math.round((device.loadCurrentL3 ?? 0) * 10) / 10,
      계통: Math.round((device.gridCurrentL3 ?? 0) * 10) / 10,
    },
  ];

  const thdData = [
    {
      phase: "L1",
      보상전: Math.round((device.loadCurrentTHDL1 ?? 0) * 10) / 10,
      보상후: Math.round((device.gridCurrentTHDL1 ?? 0) * 10) / 10,
    },
    {
      phase: "L2",
      보상전: Math.round((device.loadCurrentTHDL2 ?? 0) * 10) / 10,
      보상후: Math.round((device.gridCurrentTHDL2 ?? 0) * 10) / 10,
    },
    {
      phase: "L3",
      보상전: Math.round((device.loadCurrentTHDL3 ?? 0) * 10) / 10,
      보상후: Math.round((device.gridCurrentTHDL3 ?? 0) * 10) / 10,
    },
  ];

  const powerData = [
    { name: "S (kVA)", 보상전: device.uncompS ?? 0, 보상후: device.compS ?? 0 },
    { name: "P (kW)", 보상전: device.uncompP ?? 0, 보상후: device.compP ?? 0 },
    { name: "Q (kvar)", 보상전: device.uncompQ ?? 0, 보상후: device.compQ ?? 0 },
    { name: "H (kvar)", 보상전: device.uncompH ?? 0, 보상후: device.compH ?? 0 },
  ];

  return (
    <div className="device-charts-grid">
      {/* Voltage */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전압 (V)</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={voltageData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="phase" stroke="rgba(255,255,255,0.35)" fontSize={12} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={[200, 230]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="전압" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Current comparison: Load vs Grid */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전류 (A) — 부하 vs 계통</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={currentData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="phase" stroke="rgba(255,255,255,0.35)" fontSize={12} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="circle" iconSize={8} />
            <Bar dataKey="부하" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={28} />
            <Bar dataKey="계통" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* THD */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전류 THD (%) — 보상 전후</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={thdData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="phase" stroke="rgba(255,255,255,0.35)" fontSize={12} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="circle" iconSize={8} />
            <Bar dataKey="보상전" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={28} />
            <Bar dataKey="보상후" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Power */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전력 — 보상 전후 비교</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={powerData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="circle" iconSize={8} />
            <Bar dataKey="보상전" fill="#64748B" radius={[4, 4, 0, 0]} barSize={28} />
            <Bar dataKey="보상후" fill="#10B981" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Power factor gauges */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">역률 (%) — 보상 전후</h3>
        <div className="pf-gauge-row">
          <PfGauge label="TPF" before={device.tpf1} after={device.tpf2} />
          <PfGauge label="DPF" before={device.dpf1} after={device.dpf2} />
        </div>
      </div>

      {/* Module status */}
      {device.moduleStatus && device.moduleStatus.length > 0 && (
        <div className="chart-card chart-card-wide">
          <h3 className="chart-title">
            모듈 상태{" "}
            <span className="chart-title-sub">
              ({device.moduleStatus.filter((s) => s === 2).length}/
              {device.moduleStatus.length} 정상)
            </span>
          </h3>
          <div className="module-dot-grid">
            {device.moduleStatus.map((s, i) => (
              <div
                key={i}
                className={`module-dot-new ${moduleStatusClass(s)}`}
                title={`모듈 ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
