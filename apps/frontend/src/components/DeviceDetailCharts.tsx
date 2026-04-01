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

function ChartEmpty({ message = "데이터 없음" }: { message?: string }) {
  return (
    <div className="history-empty device-detail-chart-empty" style={{ minHeight: CHART_H - 32 }}>
      <p>{message}</p>
    </div>
  );
}

function PfGauge({
  label,
  before,
  after,
}: {
  label: string;
  before?: number | null;
  after?: number | null;
}) {
  /* TPF/DPF stored as 0–100 % (same scale as HMI) */
  const bPct = before != null ? Math.round(before * 10) / 10 : null;
  const aPct = after != null ? Math.round(after * 10) / 10 : null;

  if (bPct == null && aPct == null) {
    return (
      <div className="pf-gauge pf-gauge-empty">
        <span className="pf-gauge-title">{label}</span>
        <div className="history-empty device-detail-chart-empty" style={{ minHeight: 120 }}>
          <p>데이터 없음</p>
        </div>
      </div>
    );
  }

  if (bPct == null || aPct == null) {
    return (
      <div className="pf-gauge pf-gauge-partial">
        <span className="pf-gauge-title">{label}</span>
        <div className="pf-gauge-values pf-gauge-values-stacked">
          <span className="pf-gauge-before">
            보상 전: {bPct != null ? `${bPct.toFixed(1)}%` : "—"}
          </span>
          <span className="pf-gauge-after">
            보상 후: {aPct != null ? `${aPct.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>
    );
  }

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

function hasVoltage(d: Device): boolean {
  return d.vL1 != null || d.vL2 != null || d.vL3 != null;
}

function hasCurrent(d: Device): boolean {
  return [
    d.loadCurrentL1,
    d.loadCurrentL2,
    d.loadCurrentL3,
    d.gridCurrentL1,
    d.gridCurrentL2,
    d.gridCurrentL3,
  ].some((v) => v != null);
}

function hasThd(d: Device): boolean {
  return [
    d.loadCurrentTHDL1,
    d.loadCurrentTHDL2,
    d.loadCurrentTHDL3,
    d.gridCurrentTHDL1,
    d.gridCurrentTHDL2,
    d.gridCurrentTHDL3,
  ].some((v) => v != null);
}

function hasPower(d: Device): boolean {
  return [
    d.uncompS,
    d.compS,
    d.uncompP,
    d.compP,
    d.uncompQ,
    d.compQ,
    d.uncompH,
    d.compH,
  ].some((v) => v != null);
}

function hasPf(d: Device): boolean {
  return [d.tpf1, d.tpf2, d.dpf1, d.dpf2].some((v) => v != null);
}

function hasCapTelemetry(d: Device): boolean {
  return (
    d.totalCapacity != null ||
    d.operatingCapacity != null ||
    d.reactivePowerCapacity != null ||
    d.availableMargin != null
  );
}

export default function DeviceDetailCharts({ device }: { device: Device }) {
  const voltageData = [
    {
      phase: "L1",
      전압: device.vL1 != null ? Math.round(device.vL1 * 10) / 10 : null,
    },
    {
      phase: "L2",
      전압: device.vL2 != null ? Math.round(device.vL2 * 10) / 10 : null,
    },
    {
      phase: "L3",
      전압: device.vL3 != null ? Math.round(device.vL3 * 10) / 10 : null,
    },
  ];

  const currentData = [
    {
      phase: "L1",
      보상전:
        device.loadCurrentL1 != null
          ? Math.round(device.loadCurrentL1 * 10) / 10
          : null,
      보상후:
        device.gridCurrentL1 != null
          ? Math.round(device.gridCurrentL1 * 10) / 10
          : null,
    },
    {
      phase: "L2",
      보상전:
        device.loadCurrentL2 != null
          ? Math.round(device.loadCurrentL2 * 10) / 10
          : null,
      보상후:
        device.gridCurrentL2 != null
          ? Math.round(device.gridCurrentL2 * 10) / 10
          : null,
    },
    {
      phase: "L3",
      보상전:
        device.loadCurrentL3 != null
          ? Math.round(device.loadCurrentL3 * 10) / 10
          : null,
      보상후:
        device.gridCurrentL3 != null
          ? Math.round(device.gridCurrentL3 * 10) / 10
          : null,
    },
  ];

  const thdData = [
    {
      phase: "L1",
      보상전:
        device.loadCurrentTHDL1 != null
          ? Math.round(device.loadCurrentTHDL1 * 10) / 10
          : null,
      보상후:
        device.gridCurrentTHDL1 != null
          ? Math.round(device.gridCurrentTHDL1 * 10) / 10
          : null,
    },
    {
      phase: "L2",
      보상전:
        device.loadCurrentTHDL2 != null
          ? Math.round(device.loadCurrentTHDL2 * 10) / 10
          : null,
      보상후:
        device.gridCurrentTHDL2 != null
          ? Math.round(device.gridCurrentTHDL2 * 10) / 10
          : null,
    },
    {
      phase: "L3",
      보상전:
        device.loadCurrentTHDL3 != null
          ? Math.round(device.loadCurrentTHDL3 * 10) / 10
          : null,
      보상후:
        device.gridCurrentTHDL3 != null
          ? Math.round(device.gridCurrentTHDL3 * 10) / 10
          : null,
    },
  ];

  const powerData = [
    {
      name: "S (kVA)",
      보상전: device.uncompS ?? null,
      보상후: device.compS ?? null,
    },
    {
      name: "P (kW)",
      보상전: device.uncompP ?? null,
      보상후: device.compP ?? null,
    },
    {
      name: "Q (kvar)",
      보상전: device.uncompQ ?? null,
      보상후: device.compQ ?? null,
    },
    {
      name: "H (kvar)",
      보상전: device.uncompH ?? null,
      보상후: device.compH ?? null,
    },
  ];

  const hasAreaTemp = (device.areaTemp?.length ?? 0) > 0;
  const hasModuleTemp = (device.moduleTemp?.length ?? 0) > 0;
  const hasFanSpeed = (device.fanSpeed?.length ?? 0) > 0;

  const areaTempData = (device.areaTemp ?? []).map((v, i) => ({
    sensor: `구역 ${i + 1}`,
    온도: Math.round(v * 10) / 10,
  }));

  const moduleTempData = (device.moduleTemp ?? []).map((v, i) => ({
    sensor: `모듈 ${i + 1}`,
    온도: Math.round(v * 10) / 10,
  }));

  const fanSpeedData = (device.fanSpeed ?? []).map((v, i) => ({
    fan: `팬 ${i + 1}`,
    RPM: Math.round(v),
  }));

  const capUnit = device.model === "paf" ? "A" : "kvar";
  const capOk = hasCapTelemetry(device);
  const totalCap =
    device.totalCapacity ?? device.capacity ?? null;
  const opCap = device.operatingCapacity ?? null;
  const rpCap = device.reactivePowerCapacity ?? null;
  const margin =
    device.availableMargin ??
    (totalCap != null && opCap != null ? totalCap - opCap : null);
  const idleCap =
    opCap != null && rpCap != null ? Math.max(0, opCap - rpCap) : null;
  const rpPct =
    capOk && totalCap != null && totalCap > 0 && rpCap != null
      ? (rpCap / totalCap) * 100
      : 0;
  const idlePct =
    capOk && totalCap != null && totalCap > 0 && idleCap != null
      ? (idleCap / totalCap) * 100
      : 0;
  const marginPct =
    capOk && totalCap != null && totalCap > 0 && margin != null
      ? (margin / totalCap) * 100
      : 0;

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
        {hasVoltage(device) ? (
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
                domain={["auto", "auto"]}
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
        ) : (
          <ChartEmpty />
        )}
      </div>

      {/* Current comparison: Load vs Grid */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">전류 (A) — 보상 전후</h3>
        {hasCurrent(device) ? (
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
        ) : (
          <ChartEmpty />
        )}
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
        {hasPower(device) ? (
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
        ) : (
          <ChartEmpty />
        )}
      </div>

      {/* Power factor gauges */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">역률 (%) — 보상 전후</h3>
        {hasPf(device) ? (
          <div className="pf-gauge-row">
            <PfGauge label="TPF" before={device.tpf1} after={device.tpf2} />
            <PfGauge label="DPF" before={device.dpf1} after={device.dpf2} />
          </div>
        ) : (
          <ChartEmpty />
        )}
      </div>

      {/* Area Temperature */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">구역 온도 (°C)</h3>
        {hasAreaTemp ? (
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
        ) : (
          <ChartEmpty />
        )}
      </div>

      {/* Module Temperature */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">모듈 온도 (°C)</h3>
        {hasModuleTemp ? (
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
        ) : (
          <ChartEmpty />
        )}
      </div>

      {/* Fan Speed */}
      <div className="chart-card chart-card-lg">
        <h3 className="chart-title">팬 속도 (m/s)</h3>
        {hasFanSpeed ? (
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
        ) : (
          <ChartEmpty />
        )}
      </div>

      {/* Capacity Snapshot */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">
          용량 현황 ({capUnit})
          {capOk && totalCap != null ? (
            <span className="chart-title-sub"> — 총용량 {totalCap} {capUnit}</span>
          ) : null}
        </h3>
        {capOk && totalCap != null ? (
          <>
            <div className="cap-snapshot-bar-wrap">
              <div className="cap-snapshot-bar">
                {rpPct > 0 && rpCap != null && (
                  <div
                    className="cap-seg-bar cap-reactive"
                    style={{ width: `${rpPct}%` }}
                    title={`무효전력 발생: ${rpCap} ${capUnit}`}
                  />
                )}
                {idlePct > 0 && idleCap != null && (
                  <div
                    className="cap-seg-bar cap-idle"
                    style={{ width: `${idlePct}%` }}
                    title={`운전 여유: ${idleCap.toFixed(1)} ${capUnit}`}
                  />
                )}
                {marginPct > 0 && margin != null && (
                  <div
                    className="cap-seg-bar cap-margin"
                    style={{ width: `${marginPct}%` }}
                    title={`여유 마진: ${margin} ${capUnit}`}
                  />
                )}
              </div>
              <div className="cap-snapshot-pct">
                {(rpPct + idlePct).toFixed(1)}% 가동
              </div>
            </div>
            <div className="cap-snapshot-stats">
              <div className="cap-stat">
                <span className="cap-stat-dot" style={{ background: "#10B981" }} />
                <span className="cap-stat-label">무효전력 발생</span>
                <span className="cap-stat-val">
                  {rpCap != null ? `${rpCap} ${capUnit}` : "—"}
                </span>
              </div>
              <div className="cap-stat">
                <span className="cap-stat-dot" style={{ background: "#3B82F6" }} />
                <span className="cap-stat-label">운전 용량</span>
                <span className="cap-stat-val">
                  {opCap != null ? `${opCap} ${capUnit}` : "—"}
                </span>
              </div>
              <div className="cap-stat">
                <span className="cap-stat-dot" style={{ background: "#64748B" }} />
                <span className="cap-stat-label">여유 마진</span>
                <span className="cap-stat-val">
                  {margin != null
                    ? `${typeof margin === "number" && !Number.isInteger(margin) ? margin.toFixed(1) : margin} ${capUnit}`
                    : "—"}
                </span>
              </div>
              <div className="cap-stat">
                <span className="cap-stat-dot" style={{ background: "rgba(255,255,255,0.2)" }} />
                <span className="cap-stat-label">총 용량</span>
                <span className="cap-stat-val">{totalCap} {capUnit}</span>
              </div>
            </div>
          </>
        ) : (
          <ChartEmpty />
        )}
      </div>
    </div>
  );
}
