"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TelemetryReading } from "../types/site";

const TOOLTIP_STYLE = {
  background: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 12,
};

const CHART_H = 220;

function fmt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Props = {
  readings: TelemetryReading[];
  hours: number;
};

export default function DeviceHistoryCharts({ readings, hours }: Props) {
  if (readings.length === 0) {
    return (
      <div className="chart-card chart-card-wide history-empty">
        <p>최근 {hours}시간 수신된 데이터가 없습니다.</p>
        <p className="history-empty-sub">HMI에서 데이터를 전송하면 여기에 그래프가 표시됩니다.</p>
      </div>
    );
  }

  const data = readings.map((r) => ({
    time: fmt(r.recordedAt),
    vL1: r.vL1 ?? null,
    vL2: r.vL2 ?? null,
    vL3: r.vL3 ?? null,
    loadCurrentL1: r.loadCurrentL1 ?? null,
    loadCurrentL2: r.loadCurrentL2 ?? null,
    loadCurrentL3: r.loadCurrentL3 ?? null,
    gridCurrentL1: r.gridCurrentL1 ?? null,
    gridCurrentL2: r.gridCurrentL2 ?? null,
    gridCurrentL3: r.gridCurrentL3 ?? null,
    thdLoad1: r.loadCurrentTHDL1 ?? null,
    thdLoad2: r.loadCurrentTHDL2 ?? null,
    thdLoad3: r.loadCurrentTHDL3 ?? null,
    thdGrid1: r.gridCurrentTHDL1 ?? null,
    thdGrid2: r.gridCurrentTHDL2 ?? null,
    thdGrid3: r.gridCurrentTHDL3 ?? null,
    tpf1: r.tpf1 != null ? Math.round(r.tpf1 * 1000) / 10 : null,
    tpf2: r.tpf2 != null ? Math.round(r.tpf2 * 1000) / 10 : null,
    uncompQ: r.uncompQ ?? null,
    compQ: r.compQ ?? null,
  }));

  return (
    <div className="device-charts-grid">
      {/* 전압 트렌드 */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">
          전압 트렌드 (V)
          <span className="chart-title-sub"> — 최근 {hours}시간 · {readings.length}개 수신</span>
        </h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gVL1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gVL2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gVL3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} interval="preserveStartEnd" />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={["auto", "auto"]} unit="V" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} V`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Area type="monotone" dataKey="vL1" name="L1" stroke="#3B82F6" fill="url(#gVL1)" dot={false} connectNulls />
            <Area type="monotone" dataKey="vL2" name="L2" stroke="#F59E0B" fill="url(#gVL2)" dot={false} connectNulls />
            <Area type="monotone" dataKey="vL3" name="L3" stroke="#10B981" fill="url(#gVL3)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 부하 전류 트렌드 */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">부하 전류 트렌드 (A)</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gIL1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gIL2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gIL3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} interval="preserveStartEnd" />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={["auto", "auto"]} unit="A" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} A`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Area type="monotone" dataKey="loadCurrentL1" name="L1" stroke="#3B82F6" fill="url(#gIL1)" dot={false} connectNulls />
            <Area type="monotone" dataKey="loadCurrentL2" name="L2" stroke="#F59E0B" fill="url(#gIL2)" dot={false} connectNulls />
            <Area type="monotone" dataKey="loadCurrentL3" name="L3" stroke="#10B981" fill="url(#gIL3)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* THD 트렌드 */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">부하 전류 THD 트렌드 (%)</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gT1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gT2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gT3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EC4899" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} interval="preserveStartEnd" />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={["auto", "auto"]} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Area type="monotone" dataKey="thdLoad1" name="L1" stroke="#F59E0B" fill="url(#gT1)" dot={false} connectNulls />
            <Area type="monotone" dataKey="thdLoad2" name="L2" stroke="#6366F1" fill="url(#gT2)" dot={false} connectNulls />
            <Area type="monotone" dataKey="thdLoad3" name="L3" stroke="#EC4899" fill="url(#gT3)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 역률 트렌드 */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">역률 트렌드 (%) — TPF 보상 전후</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gPF1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64748B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#64748B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gPF2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} interval="preserveStartEnd" />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Area type="monotone" dataKey="tpf1" name="보상 전" stroke="#64748B" fill="url(#gPF1)" dot={false} connectNulls />
            <Area type="monotone" dataKey="tpf2" name="보상 후" stroke="#10B981" fill="url(#gPF2)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 무효전력 트렌드 */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">무효전력 트렌드 (kvar) — 보상 전후</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gQ1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64748B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#64748B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gQ2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} interval="preserveStartEnd" />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} domain={["auto", "auto"]} unit=" kvar" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} kvar`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Area type="monotone" dataKey="uncompQ" name="보상 전" stroke="#64748B" fill="url(#gQ1)" dot={false} connectNulls />
            <Area type="monotone" dataKey="compQ" name="보상 후" stroke="#10B981" fill="url(#gQ2)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
