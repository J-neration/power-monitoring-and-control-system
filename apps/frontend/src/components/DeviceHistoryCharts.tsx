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
  model?: string;
};

export default function DeviceHistoryCharts({ readings, hours, model }: Props) {
  if (readings.length === 0) {
    return (
      <div className="chart-card chart-card-wide history-empty">
        <p>최근 {hours}시간 수신된 데이터가 없습니다.</p>
        <p className="history-empty-sub">HMI에서 데이터를 전송하면 여기에 그래프가 표시됩니다.</p>
      </div>
    );
  }

  const capUnit = model === "paf" ? "A" : "kvar";

  const data = readings.map((r) => {
    const totalCap = r.totalCapacity ?? null;
    const opCap = r.operatingCapacity ?? null;
    const rpCap = r.reactivePowerCapacity ?? null;
    const margin = r.availableMargin ?? (totalCap != null && opCap != null ? totalCap - opCap : null);
    const idleCap = opCap != null && rpCap != null ? Math.max(0, opCap - rpCap) : null;

    return {
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
      reactive: rpCap,
      idle: idleCap,
      margin: margin,
    };
  });

  const hasCapData = data.some((d) => d.reactive != null || d.idle != null);

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

      {/* 용량 현황 트렌드 */}
      {hasCapData && (
        <div className="chart-card chart-card-wide">
          <h3 className="chart-title">
            용량 현황 트렌드 ({capUnit})
            <span className="chart-title-sub"> — 최근 {hours}시간</span>
          </h3>
          <ResponsiveContainer width="100%" height={CHART_H + 20}>
            <AreaChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="hgReactive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="hgIdle" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="hgMargin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#475569" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#475569" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} unit={` ${capUnit}`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [`${v} ${capUnit}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="reactive" name="무효전력 발생" stackId="cap" stroke="#10B981" fill="url(#hgReactive)" dot={false} connectNulls />
              <Area type="monotone" dataKey="idle"     name="운전 여유"    stackId="cap" stroke="#3B82F6" fill="url(#hgIdle)"     dot={false} connectNulls />
              <Area type="monotone" dataKey="margin"   name="여유 마진"    stackId="cap" stroke="#64748B" fill="url(#hgMargin)"   dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
          <div className="capacity-legend-row">
            <span className="cap-badge cap-reactive">무효전력 발생용량</span>
            <span className="cap-badge cap-idle">운전 여유 (운전 − 무효전력)</span>
            <span className="cap-badge cap-margin">여유 마진 (총용량 − 운전)</span>
          </div>
        </div>
      )}
    </div>
  );
}
