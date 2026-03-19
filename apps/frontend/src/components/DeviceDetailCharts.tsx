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
  ReferenceLine,
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

function PfGauge({
  label,
  before,
  after,
}: {
  label: string;
  before?: number | null;
  after?: number | null;
}) {
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
          <RadialBar
            dataKey="value"
            cornerRadius={5}
            background={{ fill: "rgba(255,255,255,0.04)" }}
          >
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
          <span
            className="pf-gauge-after"
            style={{ color: improved ? "#10B981" : "#EF4444" }}
          >
            {aPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

const AREA_TEMP_MOCK = [35.2, 38.1, 36.7, 34.5];
const MODULE_TEMP_MOCK = [42.1, 45.3, 43.8, 41.2, 44.6, 43.0];
const FAN_SPEED_MOCK = [8.5, 9.2];

export default function DeviceDetailCharts({ device }: { device: Device }) {
  const voltageData = [
    { phase: "L1", 전압: Math.round((device.vL1 ?? 0) * 10) / 10 },
    { phase: "L2", 전압: Math.round((device.vL2 ?? 0) * 10) / 10 },
    { phase: "L3", 전압: Math.round((device.vL3 ?? 0) * 10) / 10 },
  ];

  const currentData = [
    {
      phase: "L1",
      보상전: Math.round((device.loadCurrentL1 ?? 0) * 10) / 10,
      보상후: Math.round((device.gridCurrentL1 ?? 0) * 10) / 10,
    },
    {
      phase: "L2",
      보상전: Math.round((device.loadCurrentL2 ?? 0) * 10) / 10,
      보상후: Math.round((device.gridCurrentL2 ?? 0) * 10) / 10,
    },
    {
      phase: "L3",
      보상전: Math.round((device.loadCurrentL3 ?? 0) * 10) / 10,
      보상후: Math.round((device.gridCurrentL3 ?? 0) * 10) / 10,
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
    {
      name: "Q (kvar)",
      보상전: device.uncompQ ?? 0,
      보상후: device.compQ ?? 0,
    },
    {
      name: "H (kvar)",
      보상전: device.uncompH ?? 0,
      보상후: device.compH ?? 0,
    },
  ];

  const areaTempValues =
    device.areaTemp && device.areaTemp.length > 0
      ? device.areaTemp
      : AREA_TEMP_MOCK;
  const areaTempData = areaTempValues.map((v, i) => ({
    sensor: `구역 ${i + 1}`,
    온도: Math.round(v * 10) / 10,
  }));

  const moduleTempValues =
    device.moduleTemp && device.moduleTemp.length > 0
      ? device.moduleTemp
      : MODULE_TEMP_MOCK;
  const moduleTempData = moduleTempValues.map((v, i) => ({
    sensor: `모듈 ${i + 1}`,
    온도: Math.round(v * 10) / 10,
  }));

  const fanSpeedValues =
    device.fanSpeed && device.fanSpeed.length > 0
      ? device.fanSpeed
      : FAN_SPEED_MOCK;
  const fanSpeedData = fanSpeedValues.map((v, i) => ({
    fan: `팬 ${i + 1}`,
    RPM: Math.round(v),
  }));

  const capUnit = device.model === "paf" ? "A" : "kvar";
  const totalCap = device.totalCapacity ?? device.capacity ?? 0;
  const opCap = device.operatingCapacity ?? 0;
  const rpCap = device.reactivePowerCapacity ?? 0;
  const margin = device.availableMargin ?? (totalCap - opCap);
  const idleCap = Math.max(0, opCap - rpCap);
  const rpPct = totalCap > 0 ? (rpCap / totalCap) * 100 : 0;
  const idlePct = totalCap > 0 ? (idleCap / totalCap) * 100 : 0;
  const marginPct = totalCap > 0 ? (margin / totalCap) * 100 : 0;

  return (
    <div className="device-charts-grid">
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
      {/* Voltage */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전압 (V)</h3>

        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={voltageData}
            margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="phase"
              stroke="rgba(255,255,255,0.35)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              domain={[200, 230]}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar
              dataKey="전압"
              fill="#3B82F6"
              radius={[4, 4, 0, 0]}
              barSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Current comparison: Load vs Grid */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전류 (A) — 보상 전후</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={currentData}
            margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="phase"
              stroke="rgba(255,255,255,0.35)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="보상전"
              fill="#F59E0B"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
            <Bar
              dataKey="보상후"
              fill="#3B82F6"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* THD */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전류 THD (%) — 보상 전후</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={thdData}
            margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="phase"
              stroke="rgba(255,255,255,0.35)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="보상전"
              fill="#F59E0B"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
            <Bar
              dataKey="보상후"
              fill="#6366F1"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Power */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전력 — 보상 전후 비교</h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={powerData}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="name"
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="보상전"
              fill="#64748B"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
            <Bar
              dataKey="보상후"
              fill="#10B981"
              radius={[4, 4, 0, 0]}
              barSize={28}
            />
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

      {/* Area Temperature */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">
          구역 온도 (°C)
          {device.areaTemp == null || device.areaTemp.length === 0 ? (
            <span className="chart-title-mock"> — 샘플 데이터</span>
          ) : null}
        </h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={areaTempData}
            margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="sensor"
              stroke="rgba(255,255,255,0.35)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              domain={[20, 50]}
              unit="°C"
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${v} °C`]}
            />
            <ReferenceLine
              y={38}
              stroke="#EF4444"
              strokeDasharray="4 3"
              label={{ value: "경보", fill: "#EF4444", fontSize: 11 }}
            />
            <Bar
              dataKey="온도"
              fill="#F97316"
              radius={[4, 4, 0, 0]}
              barSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Module Temperature */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">
          모듈 온도 (°C)
          {device.moduleTemp == null || device.moduleTemp.length === 0 ? (
            <span className="chart-title-mock"> — 샘플 데이터</span>
          ) : null}
        </h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={moduleTempData}
            margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="sensor"
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              domain={[20, 110]}
              unit="°C"
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${v} °C`]}
            />
            <ReferenceLine
              y={100}
              stroke="#EF4444"
              strokeDasharray="4 3"
              label={{ value: "경보", fill: "#EF4444", fontSize: 11 }}
            />
            <Bar
              dataKey="온도"
              fill="#EC4899"
              radius={[4, 4, 0, 0]}
              barSize={30}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Fan Speed */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">
          팬 속도 (m/s)
          {device.fanSpeed == null || device.fanSpeed.length === 0 ? (
            <span className="chart-title-mock"> — 샘플 데이터</span>
          ) : null}
        </h3>
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={fanSpeedData}
            margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="fan"
              stroke="rgba(255,255,255,0.35)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              fontSize={11}
              tickLine={false}
              domain={[0, 20]}
              unit=" m/s"
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${v} m/s`]}
            />
            <Bar
              dataKey="RPM"
              fill="#6366F1"
              radius={[4, 4, 0, 0]}
              barSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Capacity Snapshot */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">
          용량 현황 ({capUnit})
          <span className="chart-title-sub"> — 총용량 {totalCap} {capUnit}</span>
        </h3>
        <div className="cap-snapshot-bar-wrap">
          <div className="cap-snapshot-bar">
            {rpPct > 0 && (
              <div
                className="cap-seg-bar cap-reactive"
                style={{ width: `${rpPct}%` }}
                title={`무효전력 발생: ${rpCap} ${capUnit}`}
              />
            )}
            {idlePct > 0 && (
              <div
                className="cap-seg-bar cap-idle"
                style={{ width: `${idlePct}%` }}
                title={`운전 여유: ${idleCap.toFixed(1)} ${capUnit}`}
              />
            )}
            {marginPct > 0 && (
              <div
                className="cap-seg-bar cap-margin"
                style={{ width: `${marginPct}%` }}
                title={`여유 마진: ${margin} ${capUnit}`}
              />
            )}
          </div>
          <div className="cap-snapshot-pct">{(rpPct + idlePct).toFixed(1)}% 가동</div>
        </div>
        <div className="cap-snapshot-stats">
          <div className="cap-stat">
            <span className="cap-stat-dot" style={{ background: "#10B981" }} />
            <span className="cap-stat-label">무효전력 발생</span>
            <span className="cap-stat-val">{rpCap} {capUnit}</span>
          </div>
          <div className="cap-stat">
            <span className="cap-stat-dot" style={{ background: "#3B82F6" }} />
            <span className="cap-stat-label">운전 용량</span>
            <span className="cap-stat-val">{opCap} {capUnit}</span>
          </div>
          <div className="cap-stat">
            <span className="cap-stat-dot" style={{ background: "#64748B" }} />
            <span className="cap-stat-label">여유 마진</span>
            <span className="cap-stat-val">{margin.toFixed ? margin.toFixed(1) : margin} {capUnit}</span>
          </div>
          <div className="cap-stat">
            <span className="cap-stat-dot" style={{ background: "rgba(255,255,255,0.2)" }} />
            <span className="cap-stat-label">총 용량</span>
            <span className="cap-stat-val">{totalCap} {capUnit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
