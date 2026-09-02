"use client";

import { useMemo, useState } from "react";
import { ReferenceLine } from "recharts";
import ChartCard from "./charts/ChartCard";
import HistoryAreaChart from "./charts/HistoryAreaChart";
import type { FaultEvent } from "../lib/api";
import {
  CHART_COLORS,
  fmtChartTime,
  TEMP_ALARM_REF,
  TEMP_CHART_MARGIN_RIGHT,
  TEMP_THRESHOLDS,
  TEMP_WARN_REF,
} from "../lib/chartTheme";
import type { TelemetryReading } from "../types/site";

const TEMP_COLORS = [
  CHART_COLORS.load,
  CHART_COLORS.pink,
  CHART_COLORS.purple,
  CHART_COLORS.blue,
  CHART_COLORS.accent,
  CHART_COLORS.warn,
];

type SubTab = "pf" | "thd" | "capacity" | "temp";

const SUB_TABS: { key: SubTab; label: string; color: string }[] = [
  { key: "pf", label: "역률·전력", color: CHART_COLORS.accent },
  { key: "thd", label: "THD", color: CHART_COLORS.warn },
  { key: "capacity", label: "용량", color: CHART_COLORS.purple },
  { key: "temp", label: "온도", color: CHART_COLORS.load },
];

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

type Props = {
  readings: TelemetryReading[];
  hours: number;
  model?: string;
  faults?: FaultEvent[];
};

export default function DeviceHistoryCharts({
  readings,
  hours,
  model,
  faults = [],
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>("pf");

  const capUnit = model === "paf" ? "A" : "kvar";
  const hoursLabel = `최근 ${hours}시간`;

  const { data, maxAreaSensors, maxModSensors, maxFans, hasCapData } =
    useMemo(() => {
      const maxArea = Math.max(
        ...readings.map((r) => r.areaTemp?.length ?? 0),
        0,
      );
      const maxMod = Math.max(
        ...readings.map((r) => r.moduleTemp?.length ?? 0),
        0,
      );
      const maxFan = Math.max(
        ...readings.map((r) => r.fanSpeed?.length ?? 0),
        0,
      );

      const pfPct = (v: number | null | undefined) =>
        v != null ? Math.round(v * 10) / 10 : null;

      const rows = readings.map((r) => {
        const totalCap = r.totalCapacity ?? null;
        const opCap = r.operatingCapacity ?? null;
        const rpCap = r.reactivePowerCapacity ?? null;
        const margin =
          r.availableMargin ??
          (totalCap != null && opCap != null ? totalCap - opCap : null);
        const idleCap =
          opCap != null && rpCap != null ? Math.max(0, opCap - rpCap) : null;

        const row: Record<string, unknown> = {
          time: fmtChartTime(r.recordedAt),
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

        for (let i = 0; i < maxArea; i++) {
          row[`area${i}`] = r.areaTemp?.[i] ?? null;
        }
        for (let i = 0; i < maxMod; i++) {
          const modVal = r.moduleTemp?.[i] ?? null;
          row[`mod${i}`] = modVal != null && modVal >= 0 ? modVal : null;
        }
        for (let i = 0; i < maxFan; i++) {
          row[`fan${i}`] = r.fanSpeed?.[i] ?? null;
        }

        return row;
      });

      const cap = rows.some((d) => d.reactive != null || d.idle != null);

      return {
        data: rows,
        maxAreaSensors: maxArea,
        maxModSensors: maxMod,
        maxFans: maxFan,
        hasCapData: cap,
      };
    }, [readings]);

  const dataDateLabel = formatDataDateRangeLabel(readings);

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

  const beforeAfter = (beforeKey: string, afterKey: string, beforeColor: string, afterColor: string, gradB: string, gradA: string) => [
    {
      dataKey: beforeKey,
      name: "보상 전",
      stroke: CHART_COLORS.gridMuted,
      fill: `url(#${gradB})`,
      dashed: true,
    },
    {
      dataKey: afterKey,
      name: "보상 후",
      stroke: afterColor,
      fill: `url(#${gradA})`,
    },
  ];

  return (
    <>
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

      <div
        className={`device-charts-grid${subTab === "pf" ? " history-pf-grid" : ""}`}
      >
        {subTab === "pf" && (
          <>
            <ChartCard title="S (kVA)" subtitle="— 보상 전 / 후">
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "sB", color: CHART_COLORS.gridMuted },
                  { id: "sA", color: CHART_COLORS.purple },
                ]}
                series={beforeAfter("sBefore", "sAfter", CHART_COLORS.gridMuted, CHART_COLORS.purple, "sB", "sA")}
                yUnit=" kVA"
                faults={faults}
              />
            </ChartCard>
            <ChartCard title="P (kW)" subtitle="— 보상 전 / 후">
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "pB", color: CHART_COLORS.gridMuted },
                  { id: "pA", color: CHART_COLORS.blue },
                ]}
                series={beforeAfter("pBefore", "pAfter", CHART_COLORS.gridMuted, CHART_COLORS.blue, "pB", "pA")}
                yUnit=" kW"
                faults={faults}
              />
            </ChartCard>
            <ChartCard title="Q (kvar)" subtitle="— 보상 전 / 후">
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "qB", color: CHART_COLORS.gridMuted },
                  { id: "qA", color: CHART_COLORS.accent },
                ]}
                series={beforeAfter("qBefore", "qAfter", CHART_COLORS.gridMuted, CHART_COLORS.accent, "qB", "qA")}
                yUnit=" kvar"
                faults={faults}
              />
            </ChartCard>
            <ChartCard title="H (kvar)" subtitle="— 보상 전 / 후">
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "hB", color: CHART_COLORS.gridMuted },
                  { id: "hA", color: CHART_COLORS.load },
                ]}
                series={beforeAfter("hBefore", "hAfter", CHART_COLORS.gridMuted, CHART_COLORS.load, "hB", "hA")}
                yUnit=" kvar"
                faults={faults}
              />
            </ChartCard>
            <ChartCard title="TPF (%)" subtitle={`— ${hoursLabel}`} wide>
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "tpfB", color: CHART_COLORS.gridMuted, opacity: 0.2 },
                  { id: "tpfA", color: CHART_COLORS.accent, opacity: 0.35 },
                ]}
                series={beforeAfter("tpfBefore", "tpfAfter", CHART_COLORS.gridMuted, CHART_COLORS.accent, "tpfB", "tpfA")}
                yUnit="%"
                faults={faults}
              />
            </ChartCard>
            <ChartCard title="DPF (%)" subtitle={`— ${hoursLabel}`} wide>
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "dpfB", color: CHART_COLORS.gridMuted, opacity: 0.2 },
                  { id: "dpfA", color: CHART_COLORS.purple, opacity: 0.35 },
                ]}
                series={beforeAfter("dpfBefore", "dpfAfter", CHART_COLORS.gridMuted, CHART_COLORS.purple, "dpfB", "dpfA")}
                yUnit="%"
                faults={faults}
              />
            </ChartCard>
          </>
        )}

        {subTab === "thd" &&
          (["L1", "L2", "L3"] as const).map((phase, idx) => {
            const phaseColors = [CHART_COLORS.blue, CHART_COLORS.load, CHART_COLORS.pink];
            const color = phaseColors[idx];
            const gradB = `thdB${phase}`;
            const gradA = `thdA${phase}`;
            return (
              <ChartCard
                key={phase}
                title={`${phase} 전류 THD (%)`}
                subtitle={`— ${hoursLabel}`}
                wide
              >
                <HistoryAreaChart
                  data={data}
                  grads={[
                    { id: gradB, color: CHART_COLORS.gridMuted, opacity: 0.2 },
                    { id: gradA, color, opacity: 0.35 },
                  ]}
                  series={beforeAfter(
                    `thdBefore${phase}`,
                    `thdAfter${phase}`,
                    CHART_COLORS.gridMuted,
                    color,
                    gradB,
                    gradA,
                  )}
                  yUnit="%"
                  faults={faults}
                />
              </ChartCard>
            );
          })}

        {subTab === "capacity" &&
          (hasCapData ? (
            <ChartCard
              title={`용량 추이 (${capUnit})`}
              subtitle={`— ${hoursLabel}`}
              wide
            >
              <HistoryAreaChart
                data={data}
                grads={[
                  { id: "capR", color: CHART_COLORS.accent, opacity: 0.5 },
                  { id: "capI", color: CHART_COLORS.blue, opacity: 0.4 },
                  { id: "capM", color: CHART_COLORS.gridMuted, opacity: 0.35 },
                ]}
                series={[
                  {
                    dataKey: "reactive",
                    name: "무효 전력",
                    stroke: CHART_COLORS.accent,
                    fill: "url(#capR)",
                    stackId: "cap",
                  },
                  {
                    dataKey: "idle",
                    name: "운전 용량",
                    stroke: CHART_COLORS.blue,
                    fill: "url(#capI)",
                    stackId: "cap",
                  },
                  {
                    dataKey: "margin",
                    name: "가용 여유",
                    stroke: CHART_COLORS.gridMuted,
                    fill: "url(#capM)",
                    stackId: "cap",
                  },
                ]}
                faults={faults}
              />
              <div className="capacity-legend-row">
                <span className="cap-badge cap-reactive">무효 전력 발생</span>
                <span className="cap-badge cap-idle">운전 여유</span>
                <span className="cap-badge cap-margin">가용 마진</span>
              </div>
            </ChartCard>
          ) : (
            <div className="chart-card chart-card-wide history-empty">
              <p>용량 데이터가 없습니다.</p>
            </div>
          ))}

        {subTab === "temp" && (
          <>
            <ChartCard title="주위 온도 (°C)" subtitle={`— ${hoursLabel}`} wide>
              <HistoryAreaChart
                data={data}
                grads={Array.from({ length: maxAreaSensors }, (_, i) => ({
                  id: `ga${i}`,
                  color: TEMP_COLORS[i % TEMP_COLORS.length],
                }))}
                series={Array.from({ length: maxAreaSensors }, (_, i) => ({
                  dataKey: `area${i}`,
                  name: `주위 ${i + 1}`,
                  stroke: TEMP_COLORS[i % TEMP_COLORS.length],
                  fill: `url(#ga${i})`,
                }))}
                yDomain={[0, 50]}
                yUnit="°C"
                faults={faults}
                margin={{ right: TEMP_CHART_MARGIN_RIGHT }}
              >
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
              </HistoryAreaChart>
            </ChartCard>
            <ChartCard title="모듈 온도 (°C)" subtitle={`— ${hoursLabel}`} wide>
              <HistoryAreaChart
                data={data}
                grads={Array.from({ length: maxModSensors }, (_, i) => ({
                  id: `gm${i}`,
                  color: TEMP_COLORS[i % TEMP_COLORS.length],
                }))}
                series={Array.from({ length: maxModSensors }, (_, i) => ({
                  dataKey: `mod${i}`,
                  name: `모듈 ${i + 1}`,
                  stroke: TEMP_COLORS[i % TEMP_COLORS.length],
                  fill: `url(#gm${i})`,
                }))}
                yDomain={[0, 150]}
                yUnit="°C"
                faults={faults}
                margin={{ right: TEMP_CHART_MARGIN_RIGHT }}
              >
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
              </HistoryAreaChart>
            </ChartCard>
            <ChartCard title="팬 속도 (m/s)" subtitle={`— ${hoursLabel}`} wide>
              <HistoryAreaChart
                data={data}
                grads={Array.from({ length: maxFans }, (_, i) => ({
                  id: `gf${i}`,
                  color: TEMP_COLORS[i % TEMP_COLORS.length],
                }))}
                series={Array.from({ length: maxFans }, (_, i) => ({
                  dataKey: `fan${i}`,
                  name: `팬 ${i + 1}`,
                  stroke: TEMP_COLORS[i % TEMP_COLORS.length],
                  fill: `url(#gf${i})`,
                }))}
                yUnit=" m/s"
                faults={faults}
              />
            </ChartCard>
          </>
        )}
      </div>
    </>
  );
}
