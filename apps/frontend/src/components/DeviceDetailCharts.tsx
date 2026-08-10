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
import ChartCard from "./charts/ChartCard";
import ChartThresholdLines from "./charts/ChartThresholdLines";
import DigitalPhasePanel from "./charts/DigitalPhasePanel";
import {
  AXIS,
  CHART_COLORS,
  CHART_H,
  GRID,
  LEGEND,
  thdBarColor,
  TOOLTIP_CURSOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  TEMP_ALARM_REF,
  TEMP_CHART_MARGIN_RIGHT,
  TEMP_THRESHOLDS,
  TEMP_WARN_REF,
  VOLTAGE_NOMINAL,
} from "../lib/chartTheme";
import { getPfLevel } from "../lib/metricThreshold";
function ThdBarLegend() {
  const items = [
    { label: "보상 전", color: CHART_COLORS.accent },
    { label: "보상 후", color: CHART_COLORS.accent },
  ];
  return (
    <ul className="thd-bar-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            className="thd-bar-legend-dot"
            style={{ background: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** auto 축에서 최소값 막대가 바닥선에 붙어 안 보이는 현상 방지 */
const yDomainWithPadding = [
  (dataMin: number) => {
    if (!Number.isFinite(dataMin)) return 0;
    const pad = Math.max(Math.abs(dataMin) * 0.08, 1);
    return dataMin - pad;
  },
  (dataMax: number) => {
    if (!Number.isFinite(dataMax)) return 1;
    const pad = Math.max(Math.abs(dataMax) * 0.08, 1);
    return dataMax + pad;
  },
] as const;

function ChartEmpty({ message = "데이터 없음" }: { message?: string }) {
  return (
    <div
      className="history-empty device-detail-chart-empty"
      style={{ minHeight: CHART_H - 32 }}
    >
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
        <div
          className="history-empty device-detail-chart-empty"
          style={{ minHeight: 120 }}
        >
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

  /* Use absolute values for rendering — TPF/DPF can be negative (leading PF) */
  const bAbs = Math.abs(bPct);
  const aAbs = Math.abs(aPct);

  const afterLevel = getPfLevel(Math.abs(aPct));
  const afterColor =
    afterLevel === "danger"
      ? CHART_COLORS.danger
      : afterLevel === "warn"
        ? CHART_COLORS.warn
        : CHART_COLORS.accent;

  /* Outer ring = 보상 후 (colored), inner ring = 보상 전 (gray) */
  const data = [
    { name: "보상 후", value: aAbs, fill: afterColor },
    { name: "보상 전", value: bAbs, fill: CHART_COLORS.gridMuted },
  ];

  return (
    <div className="pf-gauge">
      <ResponsiveContainer width="100%" height={150}>
        <RadialBarChart
          innerRadius="45%"
          outerRadius="95%"
          startAngle={180}
          endAngle={0}
          data={data}
          barSize={12}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={4}
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
          <span className="pf-gauge-after" style={{ color: afterColor }}>
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
  const totalCap = device.totalCapacity ?? device.capacity ?? null;
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
      <ChartCard title="상별 계측값" subtitle="— 디지털 패널" wide>
        <DigitalPhasePanel
          rows={[
            {
              label: "전압 (V)",
              l1: device.vL1,
              l2: device.vL2,
              l3: device.vL3,
              kind: "voltage",
              suffix: " V",
            },
            {
              label: "전류 Load (A)",
              l1: device.loadCurrentL1,
              l2: device.loadCurrentL2,
              l3: device.loadCurrentL3,
              suffix: " A",
            },
            {
              label: "전류 Grid (A)",
              l1: device.gridCurrentL1,
              l2: device.gridCurrentL2,
              l3: device.gridCurrentL3,
              suffix: " A",
            },
            {
              label: "THD Load (%)",
              l1: device.loadCurrentTHDL1,
              l2: device.loadCurrentTHDL2,
              l3: device.loadCurrentTHDL3,
              kind: "thd",
              suffix: "%",
            },
            {
              label: "THD Grid (%)",
              l1: device.gridCurrentTHDL1,
              l2: device.gridCurrentTHDL2,
              l3: device.gridCurrentTHDL3,
              kind: "thd",
              suffix: "%",
            },
          ]}
        />
      </ChartCard>

      {/* Voltage */}
      <ChartCard title="전압 (V)" large>
        {hasVoltage(device) ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={voltageData}
              margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="phase" {...AXIS} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={yDomainWithPadding}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <ReferenceLine
                y={VOLTAGE_NOMINAL}
                stroke={CHART_COLORS.accent}
                strokeDasharray="4 3"
                label={{
                  value: `${VOLTAGE_NOMINAL}V`,
                  fill: CHART_COLORS.accent,
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
              <Bar
                dataKey="전압"
                fill={CHART_COLORS.blue}
                radius={[4, 4, 0, 0]}
                barSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="전류 (A)" subtitle="— 보상 전후" large>
        {hasCurrent(device) ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={currentData}
              margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="phase" {...AXIS} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={yDomainWithPadding}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Legend {...LEGEND} />
              <Bar
                dataKey="보상전"
                fill={CHART_COLORS.load}
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
              <Bar
                dataKey="보상후"
                fill={CHART_COLORS.grid}
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="전류 THD (%)" subtitle="— 보상 전후" large>
        {hasThd(device) ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={thdData}
              margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="phase" {...AXIS} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={yDomainWithPadding}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Legend content={<ThdBarLegend />} />
              <ChartThresholdLines kind="thd" />
              <Bar
                dataKey="보상전"
                fill={CHART_COLORS.accent}
                radius={[4, 4, 0, 0]}
                barSize={28}
              >
                {thdData.map((entry, i) => (
                  <Cell key={i} fill={thdBarColor(entry.보상전)} />
                ))}
              </Bar>
              <Bar
                dataKey="보상후"
                fill={CHART_COLORS.accent}
                radius={[4, 4, 0, 0]}
                barSize={28}
              >
                {thdData.map((entry, i) => (
                  <Cell key={i} fill={thdBarColor(entry.보상후)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="전력" subtitle="— 보상 전후 비교" large>
        {hasPower(device) ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={powerData}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" {...AXIS} fontSize={11} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={yDomainWithPadding}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Legend {...LEGEND} />
              <ReferenceLine
                y={0}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
              <Bar
                dataKey="보상전"
                fill={CHART_COLORS.gridMuted}
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
              <Bar
                dataKey="보상후"
                fill={CHART_COLORS.accent}
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="역률 (%)" subtitle="— 보상 전후" wide>
        {hasPf(device) ? (
          <div className="pf-gauge-row">
            <PfGauge label="TPF" before={device.tpf1} after={device.tpf2} />
            <PfGauge label="DPF" before={device.dpf1} after={device.dpf2} />
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="구역 온도 (°C)" large>
        {hasAreaTemp ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={areaTempData}
              margin={{ top: 8, right: TEMP_CHART_MARGIN_RIGHT, left: -10, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="sensor" {...AXIS} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={[0, 50]}
                unit="°C"
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
                formatter={(v) => [`${v} °C`]}
              />
              <ReferenceLine
                y={TEMP_THRESHOLDS.areaWarn}
                stroke={CHART_COLORS.load}
                {...TEMP_WARN_REF}
                label={{
                  value: `주의 ${TEMP_THRESHOLDS.areaWarn}°C`,
                  position: "right",
                  fill: CHART_COLORS.load,
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={TEMP_THRESHOLDS.areaAlarm}
                stroke={CHART_COLORS.danger}
                {...TEMP_ALARM_REF}
                label={{
                  value: `경보 ${TEMP_THRESHOLDS.areaAlarm}°C`,
                  position: "right",
                  fill: CHART_COLORS.danger,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <Bar dataKey="온도" radius={[4, 4, 0, 0]} barSize={36}>
                {areaTempData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.온도 >= TEMP_THRESHOLDS.areaAlarm
                        ? CHART_COLORS.danger
                        : entry.온도 >= TEMP_THRESHOLDS.areaWarn
                          ? CHART_COLORS.load
                          : CHART_COLORS.accent
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="모듈 온도 (°C)" large>
        {hasModuleTemp ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={moduleTempData}
              margin={{ top: 8, right: TEMP_CHART_MARGIN_RIGHT, left: -10, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="sensor" {...AXIS} fontSize={11} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={[0, 150]}
                unit="°C"
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
                formatter={(v) => [`${v} °C`]}
              />
              <ReferenceLine
                y={TEMP_THRESHOLDS.moduleWarn}
                stroke={CHART_COLORS.warn}
                {...TEMP_WARN_REF}
                label={{
                  value: `주의 ${TEMP_THRESHOLDS.moduleWarn}°C`,
                  position: "right",
                  fill: CHART_COLORS.warn,
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={TEMP_THRESHOLDS.moduleAlarm}
                stroke={CHART_COLORS.danger}
                {...TEMP_ALARM_REF}
                label={{
                  value: `경보 ${TEMP_THRESHOLDS.moduleAlarm}°C`,
                  position: "right",
                  fill: CHART_COLORS.danger,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <Bar dataKey="온도" radius={[4, 4, 0, 0]} barSize={30}>
                {moduleTempData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.온도 >= TEMP_THRESHOLDS.moduleAlarm
                        ? CHART_COLORS.danger
                        : entry.온도 >= TEMP_THRESHOLDS.moduleWarn
                          ? CHART_COLORS.warn
                          : CHART_COLORS.accent
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="팬 속도 (m/s)" large>
        {hasFanSpeed ? (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart
              data={fanSpeedData}
              margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="fan" {...AXIS} />
              <YAxis
                {...AXIS}
                allowDecimals={false}
                domain={[0, 20]}
                unit=" m/s"
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={TOOLTIP_CURSOR}
                formatter={(v) => [`${v} m/s`]}
              />
              <Bar
                dataKey="RPM"
                fill={CHART_COLORS.purple}
                radius={[4, 4, 0, 0]}
                barSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard
        title={`용량 현황 (${capUnit})`}
        subtitle={
          capOk && totalCap != null
            ? `— 총용량 ${totalCap} ${capUnit}`
            : undefined
        }
        wide
      >
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
                <span
                  className="cap-stat-dot"
                  style={{ background: CHART_COLORS.accent }}
                />
                <span className="cap-stat-label">무효전력 발생</span>
                <span className="cap-stat-val">
                  {rpCap != null ? `${rpCap} ${capUnit}` : "—"}
                </span>
              </div>
              <div className="cap-stat">
                <span
                  className="cap-stat-dot"
                  style={{ background: CHART_COLORS.blue }}
                />
                <span className="cap-stat-label">운전 용량</span>
                <span className="cap-stat-val">
                  {opCap != null ? `${opCap} ${capUnit}` : "—"}
                </span>
              </div>
              <div className="cap-stat">
                <span
                  className="cap-stat-dot"
                  style={{ background: CHART_COLORS.gridMuted }}
                />
                <span className="cap-stat-label">여유 마진</span>
                <span className="cap-stat-val">
                  {margin != null
                    ? `${typeof margin === "number" && !Number.isInteger(margin) ? margin.toFixed(1) : margin} ${capUnit}`
                    : "—"}
                </span>
              </div>
              <div className="cap-stat">
                <span
                  className="cap-stat-dot"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                />
                <span className="cap-stat-label">총 용량</span>
                <span className="cap-stat-val">
                  {totalCap} {capUnit}
                </span>
              </div>
            </div>
          </>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>
    </div>
  );
}
