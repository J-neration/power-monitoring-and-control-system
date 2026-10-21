"use client";

import { useEffect, useMemo, useState } from "react";
import { ReferenceLine } from "recharts";
import ChartCard from "./charts/ChartCard";
import HistoryAreaChart from "./charts/HistoryAreaChart";
import type { FaultEvent } from "../lib/api";
import {
  CHART_COLORS,
  TEMP_ALARM_REF,
  TEMP_CHART_MARGIN_RIGHT,
  TEMP_THRESHOLDS,
  TEMP_WARN_REF,
  areaTempOrNull,
} from "../lib/chartTheme";
import {
  formatKstClock,
  formatKstMonthDay,
  formatKstMonthDayHour,
  formatKstShortDate,
} from "../lib/kstTime";
import { DEMO_HISTORY_INSTALLATION_ID } from "../lib/demoHistoryReadings";
import type { TelemetryReading } from "../types/site";

const TEMP_COLORS = [
  CHART_COLORS.load,
  CHART_COLORS.pink,
  CHART_COLORS.purple,
  CHART_COLORS.blue,
  CHART_COLORS.accent,
  CHART_COLORS.warn,
];

type SubTab = "pf" | "power" | "thd" | "capacity" | "temp";
type Period = "day" | "week" | "month" | "year";
type Agg = "avg" | "min" | "max";
type Resolution = "raw" | "hourly" | "daily";
type RangeValue = number | Array<number | null> | null;
type RangedReading = TelemetryReading & {
  metricMin?: Record<string, RangeValue>;
  metricMax?: Record<string, RangeValue>;
};
type ChartSeries = {
  dataKey: string;
  name: string;
  stroke: string;
  fill: string;
  dashed?: boolean;
  dash?: string;
  stackId?: string;
};

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "일간" },
  { key: "week", label: "주간" },
  { key: "month", label: "월간" },
  { key: "year", label: "연간" },
];

const AGGS: { key: Agg; label: string }[] = [
  { key: "min", label: "최소" },
  { key: "avg", label: "평균" },
  { key: "max", label: "최대" },
];

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "pf", label: "역률" },
  { key: "power", label: "전력" },
  { key: "thd", label: "THD" },
  { key: "capacity", label: "용량" },
  { key: "temp", label: "온도" },
];

type HistoryPayload = {
  resolution: Resolution;
  source: string;
  from: string;
  to: string;
  coverage: number | null;
  gapCount: number;
  sampleCount: number;
  expectedCount: number;
  energy: { uncompKwh: number | null; compKwh: number | null; estimated: boolean };
  points: TelemetryReading[];
  message?: string;
};

function kstYear(input = new Date()): number {
  return new Date(input.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

function todayStartLocal(input = new Date()): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T00:00`;
}

function axisTime(iso: string, resolution: Resolution, spansYears: boolean): string {
  if (resolution === "daily") {
    return spansYears ? formatKstShortDate(iso) : formatKstMonthDay(iso);
  }
  if (resolution === "hourly") return formatKstMonthDayHour(iso);
  return formatKstClock(iso);
}

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
  installationId: string;
  readings: TelemetryReading[];
  hours: number;
  model?: string;
  faults?: FaultEvent[];
  /** 이력 점에 totalCapacity가 없을 때 쓰는 설비용량 */
  facilityTotal?: number | null;
};

export default function DeviceHistoryCharts({
  installationId,
  readings,
  hours,
  model,
  faults = [],
  facilityTotal = null,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>("pf");
  const [period, setPeriod] = useState<Period>("day");
  const [aggregation, setAggregation] = useState<Agg>("avg");
  const [detail, setDetail] = useState(false);
  const [start, setStart] = useState("");
  const [remote, setRemote] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(
    () => installationId !== DEMO_HISTORY_INSTALLATION_ID,
  );
  const [error, setError] = useState<string | null>(null);

  const demoDay =
    installationId === DEMO_HISTORY_INSTALLATION_ID && period === "day" && !start;
  const resolution: Resolution =
    remote?.resolution ??
    (period === "day" || (period === "week" && detail) ? "raw" : period === "week" ? "hourly" : "daily");

  useEffect(() => {
    if (demoDay) {
      setRemote(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    const params = new URLSearchParams({
      period,
      aggregation: "avg",
      resolution: period === "week" && detail ? "raw" : "auto",
    });
    if (start) {
      params.set(
        "start",
        period === "day" && start.includes("T") ? new Date(start).toISOString() : start,
      );
    }
    setLoading(true);
    setError(null);
    fetch(`/api/devices/${encodeURIComponent(installationId)}/history?${params}`, {
      signal: ac.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json()) as HistoryPayload;
        if (!res.ok) throw new Error(body.message || "이력을 불러오지 못했습니다.");
        if (!ac.signal.aborted) setRemote(body);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setRemote(null);
        setError(err instanceof Error ? err.message : "이력을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [demoDay, detail, installationId, period, start]);

  const capUnit = model === "paf" ? "A" : "kvar";
  const aggDisabled = resolution === "raw";
  const activeAgg: Agg = aggDisabled ? "avg" : aggregation;
  const aggLabel = AGGS.find((item) => item.key === activeAgg)?.label ?? "평균";
  const resLabel = resolution === "raw" ? "10분" : resolution === "hourly" ? "1시간" : "1일";
  const periodLabel = PERIODS.find((item) => item.key === period)?.label ?? "일간";
  const rangeLabel = `${resLabel}${resolution === "raw" ? "" : ` ${aggLabel}`}`;
  const hoursLabel =
    resolution === "raw" && period === "day" && !start
      ? `최근 ${hours}시간 · 10분`
      : period === "day"
        ? `${periodLabel} · ${rangeLabel}`
        : rangeLabel;

  const chartReadings = demoDay ? readings : remote?.points ?? (period === "day" && !start ? readings : []);
  const spansYears = useMemo(() => {
    const years = new Set(
      chartReadings.map(
        (row) => new Date(new Date(row.recordedAt).getTime() + 9 * 60 * 60 * 1000).getUTCFullYear(),
      ),
    );
    return years.size > 1;
  }, [chartReadings]);

  const { data, maxAreaSensors, maxModSensors, maxFans, hasCapData } =
    useMemo(() => {
      const maxArea = Math.max(
        ...chartReadings.map((r) => r.areaTemp?.length ?? 0),
        0,
      );
      const maxMod = Math.max(
        ...chartReadings.map((r) => r.moduleTemp?.length ?? 0),
        0,
      );
      const maxFan = Math.max(
        ...chartReadings.map((r) => r.fanSpeed?.length ?? 0),
        0,
      );

      const pfPct = (v: number) => Math.round(v * 10) / 10;
      const ranged = (value: unknown, format?: (n: number) => number) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        return format ? format(value) : value;
      };
      const picked = (reading: RangedReading, metric: string) => {
        if (activeAgg === "min") return reading.metricMin?.[metric];
        if (activeAgg === "max") return reading.metricMax?.[metric];
        return reading[metric as keyof TelemetryReading];
      };
      const putScalar = (
        row: Record<string, unknown>,
        chartKey: string,
        metric: string,
        reading: RangedReading,
        format?: (n: number) => number,
      ) => {
        row[chartKey] = ranged(picked(reading, metric), format);
      };
      const putIndex = (
        row: Record<string, unknown>,
        chartKey: string,
        metric: "areaTemp" | "moduleTemp" | "fanSpeed",
        index: number,
        reading: RangedReading,
        accept: (value: number) => number | null,
      ) => {
        const bag = picked(reading, metric);
        const value = Array.isArray(bag) ? ranged(bag[index]) : null;
        row[chartKey] = value == null ? null : accept(value);
      };

      const rows = chartReadings.map((reading) => {
        const r = reading as RangedReading;
        const reportedTotal = ranged(picked(r, "totalCapacity"));
        const totalCap =
          reportedTotal != null && reportedTotal > 0
            ? reportedTotal
            : facilityTotal != null && facilityTotal > 0
              ? facilityTotal
              : null;
        const opCap = ranged(picked(r, "operatingCapacity"));
        const margin =
          totalCap != null && opCap != null ? totalCap - opCap : null;

        const row: Record<string, unknown> = {
          time: axisTime(r.recordedAt, resolution, spansYears),
          recordedAt: r.recordedAt,
          operating: opCap,
          margin,
        };
        putScalar(row, "vL1", "vL1", r);
        putScalar(row, "vL2", "vL2", r);
        putScalar(row, "vL3", "vL3", r);
        putScalar(row, "loadCurrentL1", "loadCurrentL1", r);
        putScalar(row, "loadCurrentL2", "loadCurrentL2", r);
        putScalar(row, "loadCurrentL3", "loadCurrentL3", r);
        putScalar(row, "thdBeforeL1", "loadCurrentTHDL1", r);
        putScalar(row, "thdAfterL1", "gridCurrentTHDL1", r);
        putScalar(row, "thdBeforeL2", "loadCurrentTHDL2", r);
        putScalar(row, "thdAfterL2", "gridCurrentTHDL2", r);
        putScalar(row, "thdBeforeL3", "loadCurrentTHDL3", r);
        putScalar(row, "thdAfterL3", "gridCurrentTHDL3", r);
        putScalar(row, "tpfBefore", "tpf1", r, pfPct);
        putScalar(row, "tpfAfter", "tpf2", r, pfPct);
        putScalar(row, "dpfBefore", "dpf1", r, pfPct);
        putScalar(row, "dpfAfter", "dpf2", r, pfPct);
        putScalar(row, "sBefore", "uncompS", r);
        putScalar(row, "sAfter", "compS", r);
        putScalar(row, "pBefore", "uncompP", r);
        putScalar(row, "pAfter", "compP", r);
        putScalar(row, "qBefore", "uncompQ", r);
        putScalar(row, "qAfter", "compQ", r);
        putScalar(row, "hBefore", "uncompH", r);
        putScalar(row, "hAfter", "compH", r);
        putScalar(row, "reactive", "reactivePowerCapacity", r);
        row.margin = margin;

        for (let i = 0; i < maxArea; i++) {
          putIndex(row, `area${i}`, "areaTemp", i, r, (value) => areaTempOrNull(value));
        }
        for (let i = 0; i < maxMod; i++) {
          putIndex(row, `mod${i}`, "moduleTemp", i, r, (value) => (value >= 0 ? value : null));
        }
        for (let i = 0; i < maxFan; i++) {
          putIndex(row, `fan${i}`, "fanSpeed", i, r, (value) => value);
        }

        return row;
      });

      const cap = rows.some(
        (d) => d.reactive != null || d.operating != null || d.margin != null,
      );

      return {
        data: rows,
        maxAreaSensors: maxArea,
        maxModSensors: maxMod,
        maxFans: maxFan,
        hasCapData: cap,
      };
    }, [activeAgg, chartReadings, facilityTotal, resolution, spansYears]);

  const dataDateLabel = formatDataDateRangeLabel(chartReadings);
  const coverageLabel =
    remote && remote.coverage != null && !demoDay
      ? `수집률 ${Math.min(100, Math.round(remote.coverage * 100))}%`
      : "";
  const gapLabel = remote && remote.gapCount > 0 ? `누락 ${remote.gapCount}` : "";
  const todayStart = todayStartLocal();

  const rangeBar = (
    <div className="history-range-bar">
      <div className="monitor-view-chips" role="tablist" aria-label="조회 기간">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={period === key}
            className={`monitor-view-chip${period === key ? " active" : ""}`}
            onClick={() => {
              setPeriod(key);
              setStart("");
              setDetail(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="monitor-view-chips" role="group" aria-label="집계값">
        {AGGS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`monitor-view-chip${activeAgg === key ? " active" : ""}`}
            aria-pressed={activeAgg === key}
            disabled={aggDisabled && key !== "avg"}
            title={aggDisabled && key !== "avg" ? "10분 원본에는 구간 최소·최대가 없습니다" : undefined}
            onClick={() => setAggregation(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "week" ? (
        <div className="monitor-view-chips">
          <button
            type="button"
            className={`monitor-view-chip${detail ? " active" : ""}`}
            onClick={() => setDetail((value) => !value)}
          >
            10분 상세
          </button>
        </div>
      ) : null}
      {period === "day" ? (
        <>
          <input
            className="history-range-input"
            type="datetime-local"
            aria-label="일간 시작 시각"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <div className="monitor-view-chips" role="group" aria-label="일간 범위">
            <button
              type="button"
              className={`monitor-view-chip${!start ? " active" : ""}`}
              aria-pressed={!start}
              onClick={() => setStart("")}
            >
              최근 24시간
            </button>
            <button
              type="button"
              className={`monitor-view-chip${start === todayStart ? " active" : ""}`}
              aria-pressed={start === todayStart}
              onClick={() => setStart(todayStart)}
            >
              오늘
            </button>
          </div>
        </>
      ) : null}
      {period === "week" ? (
        <input
          className="history-range-input"
          type="date"
          aria-label="주간 시작일"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      ) : null}
      {period === "month" ? (
        <input
          className="history-range-input"
          type="month"
          aria-label="월 선택"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      ) : null}
      {period === "year" ? (
        <input
          className="history-range-input"
          type="number"
          min={2020}
          max={2100}
          aria-label="연도 선택"
          placeholder={String(kstYear())}
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      ) : null}
    </div>
  );

  const nav = (
    <nav className="monitor-view-nav" aria-label="이력 화면">
      <div className="monitor-view-chips" role="tablist">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={subTab === key}
            className={`monitor-view-chip${subTab === key ? " active" : ""}`}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {dataDateLabel && !loading ? (
        <p className="history-data-date-line" aria-label="데이터 기준 날짜">
          {[dataDateLabel, coverageLabel, gapLabel].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </nav>
  );

  if (loading) {
    return (
      <div className="device-monitor-board">
        {rangeBar}
        {nav}
        <div className="history-loading" role="status" aria-live="polite" aria-busy="true">
          <span className="history-loading-spinner" aria-hidden />
          <span className="history-loading-label">이력을 불러오는 중</span>
        </div>
      </div>
    );
  }

  if (!chartReadings.some((row) => !(row as { gap?: boolean }).gap)) {
    return (
      <div className="device-monitor-board">
        {rangeBar}
        {nav}
        <div className="chart-card chart-card-wide history-empty">
          <p>{error ?? `${hoursLabel} 수신된 데이터가 없습니다.`}</p>
          <p className="history-empty-sub">
            누락된 구간은 선이 끊긴 채로 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  const beforeAfter = (beforeKey: string, afterKey: string, beforeColor: string, afterColor: string, gradB: string, gradA: string): ChartSeries[] => [
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
    <div className="device-monitor-board">
      {rangeBar}
      {nav}
      {error ? <p className="history-energy-note">{error}</p> : null}

      <div className="device-history-body device-charts-grid">
        {subTab === "power" && (
          <>
            <ChartCard title="S (kVA)" subtitle={`— 보상 전 / 후 · ${hoursLabel}`} wide>
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
            <ChartCard title="P (kW)" subtitle={`— 보상 전 / 후 · ${hoursLabel}`} wide>
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
            <ChartCard title="Q (kvar)" subtitle={`— 보상 전 / 후 · ${hoursLabel}`} wide>
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
            <ChartCard title="H (kvar)" subtitle={`— 보상 전 / 후 · ${hoursLabel}`} wide>
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
          </>
        )}

        {subTab === "pf" && (
          <>
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
                subtitle={`— 보상 전 / 후 · ${hoursLabel}`}
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
                  yDomain={[0, "auto"]}
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
                  },
                  {
                    dataKey: "operating",
                    name: "운전 용량",
                    stroke: CHART_COLORS.blue,
                    fill: "url(#capI)",
                  },
                  {
                    dataKey: "margin",
                    name: "가용 여유",
                    stroke: CHART_COLORS.gridMuted,
                    fill: "url(#capM)",
                  },
                ]}
                yUnit={capUnit === "A" ? " A" : " kvar"}
                faults={faults}
              />
              <div className="capacity-legend-row">
                <span className="cap-badge cap-reactive">무효 전력 발생</span>
                <span className="cap-badge cap-idle">운전 용량</span>
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
    </div>
  );
}
