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
  Cell,
  ReferenceLine,
} from "recharts";
import type { Device } from "../types/site";
import ChartCard from "./charts/ChartCard";
import ChartThresholdLines from "./charts/ChartThresholdLines";
import DigitalPhasePanel from "./charts/DigitalPhasePanel";
import { phaseUnbalancePct } from "../lib/opsSavings";
import {
  AXIS,
  CHART_COLORS,
  CHART_H,
  GRID,
  LEGEND,
  PF_QTY,
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
import CompareRingGauge from "./charts/CompareRingGauge";
import PfNeedleGauge from "./charts/PfNeedleGauge";
import CapacitySnapshot from "./CapacitySnapshot";

export type DeviceChartSection = "pf" | "thd" | "unbalance" | "thermal";
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

function powerBarFill(name: string, which: "before" | "after"): string {
  if (name.startsWith("Q")) return which === "after" ? PF_QTY.q : PF_QTY.qDim;
  if (name.startsWith("H")) return which === "after" ? PF_QTY.h : PF_QTY.hDim;
  return which === "after" ? PF_QTY.other : PF_QTY.otherDim;
}

function PowerAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const name = String(payload?.value ?? "");
  const isQ = name.startsWith("Q");
  const isH = name.startsWith("H");
  const fill = isQ ? PF_QTY.q : isH ? PF_QTY.h : "rgba(255,255,255,0.45)";
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      fill={fill}
      fontSize={11}
      fontWeight={isQ || isH ? 700 : 500}
    >
      {name}
    </text>
  );
}

type DeviceDetailChartsProps = {
  device: Device;
  compact?: boolean;
  section?: DeviceChartSection;
};

export default function DeviceDetailCharts({
  device,
  compact = false,
  section,
}: DeviceDetailChartsProps) {
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
    sensor: `주위 ${i + 1}`,
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

  const plotH = compact || section ? "100%" : CHART_H;
  const fill = Boolean(compact || section);
  const compactMode = compact && !section;
  const show = (keys: DeviceChartSection[]) =>
    !section || keys.includes(section);
  const vUnbalance = phaseUnbalancePct(device.vL1, device.vL2, device.vL3);
  const iLoadUnbalance = phaseUnbalancePct(
    device.loadCurrentL1,
    device.loadCurrentL2,
    device.loadCurrentL3,
  );
  const iGridUnbalance = phaseUnbalancePct(
    device.gridCurrentL1,
    device.gridCurrentL2,
    device.gridCurrentL3,
  );

  return (
    <div
      className={`device-charts-grid${compactMode ? " device-charts-grid--compact" : ""}${section ? ` device-charts-grid--section device-charts-grid--${section}` : ""}`}
    >
      {show(["unbalance"]) && (
      <ChartCard title="상별 계측값" subtitle="— 디지털 패널" wide={!compactMode && section !== "unbalance"} fill={fill}>
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
      )}

      {section === "unbalance" && (
      <ChartCard
        title="불평형 (%)"
        subtitle="— 전압 LVUR · 전류 불평형"
        fill
      >
        <div className="pf-gauge-row monitor-pf-row">
          <CompareRingGauge
            label="전압 불평형"
            after={vUnbalance}
            kind="unbalance"
          />
          <CompareRingGauge
            label="전류 불평형"
            before={iLoadUnbalance}
            after={iGridUnbalance}
            kind="unbalance"
          />
        </div>
      </ChartCard>
      )}

      {show(["unbalance"]) && !compactMode && (
      <>
      <ChartCard title="전압 (V)" large fill={fill}>
        {hasVoltage(device) ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
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
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="전류 (A)" subtitle="— 보상 전후" large fill={fill}>
        {hasCurrent(device) ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
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
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>
      </>
      )}

      {section === "thd" && (
      <ChartCard title="상별 THDi" subtitle="— 보상 전후" fill>
        <div className="pf-gauge-row monitor-pf-row">
          <CompareRingGauge
            label="THDi L1"
            before={device.loadCurrentTHDL1}
            after={device.gridCurrentTHDL1}
            kind="thd"
          />
          <CompareRingGauge
            label="THDi L2"
            before={device.loadCurrentTHDL2}
            after={device.gridCurrentTHDL2}
            kind="thd"
          />
          <CompareRingGauge
            label="THDi L3"
            before={device.loadCurrentTHDL3}
            after={device.gridCurrentTHDL3}
            kind="thd"
          />
        </div>
      </ChartCard>
      )}

      {show(["thd"]) && (
      <ChartCard
        title="전류 THD (%)"
        subtitle="— 보상 전후 · IEEE 519 8%"
        large={!compactMode}
        fill={fill}
      >
        {hasThd(device) ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
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
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>
      )}

      {show(["pf"]) && (
      <ChartCard
        title="전력"
        subtitle="— 보상 전후 비교"
        large={!compactMode}
        fill={fill}
        legend={
          <ul className="pf-power-legend">
            <li>
              <span className="pf-qty-pill pf-qty-pill--q">Q</span>
              DPF
            </li>
            <li>
              <span className="pf-qty-pill pf-qty-pill--q">Q</span>
              <span className="pf-qty-plus">+</span>
              <span className="pf-qty-pill pf-qty-pill--h">H</span>
              TPF
            </li>
          </ul>
        }
      >
        {hasPower(device) ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
            <BarChart
              data={powerData}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" {...AXIS} fontSize={11} tick={<PowerAxisTick />} />
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
                y={0}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
              <Bar
                dataKey="보상전"
                radius={[4, 4, 0, 0]}
                barSize={28}
              >
                {powerData.map((entry) => (
                  <Cell key={`pre-${entry.name}`} fill={powerBarFill(entry.name, "before")} />
                ))}
              </Bar>
              <Bar
                dataKey="보상후"
                radius={[4, 4, 0, 0]}
                barSize={28}
              >
                {powerData.map((entry) => (
                  <Cell key={`post-${entry.name}`} fill={powerBarFill(entry.name, "after")} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>
      )}

      {show(["pf"]) && (
      <ChartCard
        title="역률 (%)"
        fill={fill}
      >
        {hasPf(device) ? (
          <div className="pf-gauge-row monitor-pf-row">
            <PfNeedleGauge
              label="TPF"
              kind="tpf"
              before={device.tpf1}
              after={device.tpf2}
              qBefore={device.uncompQ}
              qAfter={device.compQ}
              hBefore={device.uncompH}
              hAfter={device.compH}
            />
            <PfNeedleGauge
              label="DPF"
              kind="dpf"
              before={device.dpf1}
              after={device.dpf2}
              qBefore={device.uncompQ}
              qAfter={device.compQ}
            />
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>
      )}

      {show(["thermal"]) && !compactMode && (
      <>
      <ChartCard title="주위 온도 (°C)" large fill={fill}>
        {hasAreaTemp ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
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
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="모듈 온도 (°C)" large fill={fill}>
        {hasModuleTemp ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
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
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ChartCard title="팬 속도 (m/s)" large fill={fill}>
        {hasFanSpeed ? (
          <div className={fill ? "chart-card-plot" : undefined}>
          <ResponsiveContainer width="100%" height={plotH}>
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
          </div>
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <CapacitySnapshot device={device} fill={fill} wide={!section} />
      </>
      )}
    </div>
  );
}
