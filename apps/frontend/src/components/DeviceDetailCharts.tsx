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
} from "recharts";
import type { Device } from "../types/site";

function moduleStatusClass(s: number) {
  if (s === 2) return "running";
  if (s === 3) return "fault";
  if (s === 1) return "standby";
  return "offline";
}

function PfBar({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: number | null;
  highlight?: boolean;
}) {
  const pct = value != null ? Math.round(value * 100) : 0;
  return (
    <div className="pf-row">
      <span className="pf-label">{label}</span>
      <div className="pf-track">
        <div
          className={`pf-fill${highlight ? " highlight" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="pf-value">
        {value != null ? `${(value * 100).toFixed(1)}%` : "—"}
      </span>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 12,
};

export default function DeviceDetailCharts({ device }: { device: Device }) {
  const voltageData = [
    { phase: "L1", 전압: Math.round((device.vL1 ?? 0) * 10) / 10 },
    { phase: "L2", 전압: Math.round((device.vL2 ?? 0) * 10) / 10 },
    { phase: "L3", 전압: Math.round((device.vL3 ?? 0) * 10) / 10 },
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
    {
      name: "S (kVA)",
      보상전: device.uncompS ?? 0,
      보상후: device.compS ?? 0,
    },
    {
      name: "P (kW)",
      보상전: device.uncompP ?? 0,
      보상후: device.compP ?? 0,
    },
    {
      name: "Q (kvar)",
      보상전: device.uncompQ ?? 0,
      보상후: device.compQ ?? 0,
    },
  ];

  return (
    <div className="device-charts-grid">
      {/* Voltage */}
      <div className="chart-card">
        <h3 className="chart-title">전압 (V)</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={voltageData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="phase" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={[200, 230]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="전압" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* THD */}
      <div className="chart-card">
        <h3 className="chart-title">전류 THD (%)</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={thdData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="phase" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
            <Bar dataKey="보상전" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="보상후" fill="#6366F1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Power */}
      <div className="chart-card">
        <h3 className="chart-title">전력 — 보정 전후 비교</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={powerData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
            <Bar dataKey="보상전" fill="#64748B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="보상후" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Power factor */}
      <div className="chart-card">
        <h3 className="chart-title">역률 (%)</h3>
        <div className="pf-grid">
          <PfBar label="TPF 보상 전" value={device.tpf1} />
          <PfBar label="TPF 보상 후" value={device.tpf2} highlight />
          <PfBar label="DPF 보상 전" value={device.dpf1} />
          <PfBar label="DPF 보상 후" value={device.dpf2} highlight />
        </div>
      </div>

      {/* Module status */}
      {device.moduleStatus && device.moduleStatus.length > 0 && (
        <div className="chart-card">
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
