"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { Device } from "../types/site";
import ChartCard from "./charts/ChartCard";
import ChartThresholdLines from "./charts/ChartThresholdLines";
import UnbalanceLimitBar from "./charts/UnbalanceLimitBar";
import UnbalanceDeviationChart from "./charts/UnbalanceDeviationChart";
import { phaseDeviationPcts, phaseUnbalancePct } from "../lib/opsSavings";
import {
  AXIS,
  CHART_COLORS,
  CHART_H,
  GRID,
  PF_QTY,
  THD_LOW_LOAD_COLOR,
  thdBarColor,
  thdDangerLineMuted,
  TOOLTIP_CURSOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  TEMP_ALARM_REF,
  TEMP_CHART_MARGIN_RIGHT,
  TEMP_THRESHOLDS,
  TEMP_WARN_REF,
  areaTempOrNull,
  withChartUnit,
} from "../lib/chartTheme";
import PfNeedleGauge from "./charts/PfNeedleGauge";
import PfQtyMix from "./charts/PfQtyMix";
import ThdArcGauge from "./charts/ThdArcGauge";
import { ThdInfoTip } from "./ThdLoadNotice";
import { isLowLoadCurrent } from "../lib/lowLoad";

export type DeviceChartSection = "pf" | "thd" | "unbalance" | "thermal";
function ThdBarLegend() {
  return (
    <ul className="thd-bar-legend">
      <li>왼쪽 · 보상 전</li>
      <li>오른쪽 · 보상 후</li>
    </ul>
  );
}

function ThdGaugeLegend() {
  return (
    <ul className="thd-bar-legend">
      <li>
        <span className="thd-arc-leg-swatch thd-arc-leg-swatch--out" aria-hidden />
        바깥 · 보상 전
      </li>
      <li>
        <span className="thd-arc-leg-swatch thd-arc-leg-swatch--in" aria-hidden />
        안쪽 · 보상 후
      </li>
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

function ThdAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const raw = String(payload?.value ?? "");
  const [phase, note] = raw.split(" · ");
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill="rgba(255,255,255,0.45)"
      fontSize={11}
      fontFamily="JetBrains Mono, Consolas, monospace"
    >
      <tspan x={x} dy={12}>
        {phase}
      </tspan>
      {note ? (
        <tspan x={x} dy={12} fill={THD_LOW_LOAD_COLOR} fontSize={9}>
          {note}
        </tspan>
      ) : null}
    </text>
  );
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
  const vDeviation = phaseDeviationPcts(device.vL1, device.vL2, device.vL3).map(
    (row) => ({ phase: row.phase, 편차: row.pct }),
  );
  const iLoadDev = phaseDeviationPcts(
    device.loadCurrentL1,
    device.loadCurrentL2,
    device.loadCurrentL3,
  );
  const iGridDev = phaseDeviationPcts(
    device.gridCurrentL1,
    device.gridCurrentL2,
    device.gridCurrentL3,
  );
  const iDeviation = iLoadDev.map((row, i) => ({
    phase: row.phase,
    보상전: row.pct,
    보상후: iGridDev[i]?.pct ?? null,
  }));

  const thdData = (
    [
      ["L1", device.loadCurrentTHDL1, device.gridCurrentTHDL1, device.loadCurrentL1],
      ["L2", device.loadCurrentTHDL2, device.gridCurrentTHDL2, device.loadCurrentL2],
      ["L3", device.loadCurrentTHDL3, device.gridCurrentTHDL3, device.loadCurrentL3],
    ] as const
  ).map(([phase, before, after, amps]) => {
    const lowLoad = isLowLoadCurrent(amps);
    const round = (v: number | null | undefined) =>
      v != null && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
    return {
      phase: lowLoad ? `${phase} · 저부하` : phase,
      lowLoad,
      보상전: round(before),
      보상후: round(after),
    };
  });
  const muteThdDanger = thdDangerLineMuted(
    thdData.map((row) => ({
      before: row.보상전,
      after: row.보상후,
      lowLoad: row.lowLoad,
    })),
  );

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

  const areaTempData = (device.areaTemp ?? []).map((v, i) => ({
    ch: String(i + 1),
    온도: areaTempOrNull(v) != null ? Math.round(v * 10) / 10 : null,
  }));
  const hasAreaTemp = areaTempData.some((d) => d.온도 != null);
  const hasModuleTemp = (device.moduleTemp?.length ?? 0) > 0;
  const hasFanSpeed = (device.fanSpeed?.length ?? 0) > 0;

  const moduleTempData = (device.moduleTemp ?? []).map((v, i) => ({
    ch: String(i + 1),
    온도: Math.round(v * 10) / 10,
  }));

  const fanSpeedData = (device.fanSpeed ?? []).map((v, i) => ({
    ch: String(i + 1),
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
      {section === "unbalance" && (
        <>
          <ChartCard
            title="불평형 KPI"
            subtitle="— 세 상 크기가 얼마나 다른지 (LVUR)"
            wide
          >
            <div className="unb-limit-row">
              <UnbalanceLimitBar label="전압 불평형" value={vUnbalance} />
              <UnbalanceLimitBar
                label="전류 불평형"
                before={iLoadUnbalance}
                value={iGridUnbalance}
              />
            </div>
            <ul className="unb-limit-notes">
              <li>
                <span className="unb-limit-notes-tag unb-limit-notes-tag--motor">
                  전동기 1%
                </span>
                <span>
                  <strong>NEMA MG-1</strong> — 미국 전동기 제작 규격. 전압 불평형이 1%를
                  넘으면 모터가 더 뜨거워지고 수명이 줄어든다고 봅니다.
                </span>
              </li>
              <li>
                <span className="unb-limit-notes-tag unb-limit-notes-tag--grid">
                  계통 2%
                </span>
                <span>
                  <strong>IEC 61000-2-2 / EN 50160</strong> — 유럽·국제 저압 계통 품질
                  규격. 공공 저압망에서 전압 불평형의 양립 레벨(이 정도까지는 설비가
                  견딘다고 보는 값)이 2%입니다.
                </span>
              </li>
              <li>
                <span className="unb-limit-notes-tag unb-limit-notes-tag--danger">
                  위험 5%
                </span>
                <span>
                  이 화면의 막대 만칸입니다. 품질 점수에서는 5% 이상을 0점으로 둡니다.
                  법정 차단값이 아니라 관제용 상한입니다.
                </span>
              </li>
            </ul>
          </ChartCard>
          <ChartCard
            title="전압 상편차 (%)"
            subtitle="— (Vφ − Vavg) / Vavg"
            fill
          >
            {hasVoltage(device) ? (
              <div className="chart-card-plot">
                <UnbalanceDeviationChart
                  data={vDeviation}
                  series={[{ key: "편차", name: "상편차", color: CHART_COLORS.blue }]}
                  height={plotH}
                  colorByLimit
                />
              </div>
            ) : (
              <ChartEmpty />
            )}
          </ChartCard>
          <ChartCard
            title="전류 상편차 (%)"
            subtitle="— 보상 전(부하) / 후(계통)"
            fill
            legend={
              <ul className="thd-bar-legend">
                <li>
                  <span className="unb-leg unb-leg--before" aria-hidden />
                  보상 전
                </li>
                <li>
                  <span className="unb-leg unb-leg--after" aria-hidden />
                  보상 후
                </li>
              </ul>
            }
          >
            {hasCurrent(device) ? (
              <div className="chart-card-plot">
                <UnbalanceDeviationChart
                  data={iDeviation}
                  series={[
                    { key: "보상전", name: "보상 전", color: CHART_COLORS.load },
                    { key: "보상후", name: "보상 후", color: CHART_COLORS.grid },
                  ]}
                  height={plotH}
                />
              </div>
            ) : (
              <ChartEmpty />
            )}
          </ChartCard>
        </>
      )}


      {section === "thd" && (
        <ChartCard
          title="상별 THDi (%)"
          titleExtra={<ThdInfoTip />}
          subtitle="— 바깥 보상 전 · 안쪽 보상 후"
          fill
          legend={<ThdGaugeLegend />}
        >
          <div className="pf-gauge-row monitor-pf-row">
            <ThdArcGauge
              label="THDi L1"
              before={device.loadCurrentTHDL1}
              after={device.gridCurrentTHDL1}
              loadCurrent={device.loadCurrentL1}
              showInfo={false}
              showLegend={false}
            />
            <ThdArcGauge
              label="THDi L2"
              before={device.loadCurrentTHDL2}
              after={device.gridCurrentTHDL2}
              loadCurrent={device.loadCurrentL2}
              showInfo={false}
              showLegend={false}
            />
            <ThdArcGauge
              label="THDi L3"
              before={device.loadCurrentTHDL3}
              after={device.gridCurrentTHDL3}
              loadCurrent={device.loadCurrentL3}
              showInfo={false}
              showLegend={false}
            />
          </div>
        </ChartCard>
      )}

      {show(["thd"]) && (
        <ChartCard
          title="전류 THD (%)"
          large={!compactMode}
          fill={fill}
          legend={<ThdBarLegend />}
        >
          {hasThd(device) ? (
            <div className={fill ? "chart-card-plot" : undefined}>
              <ResponsiveContainer width="100%" height={plotH}>
                <BarChart
                  data={thdData}
                  margin={{
                    top: 8,
                    right: 12,
                    left: 0,
                    bottom: thdData.some((row) => row.lowLoad) ? 20 : 8,
                  }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="phase"
                    {...AXIS}
                    interval={0}
                    tick={<ThdAxisTick />}
                    tickMargin={8}
                  />
                  <YAxis
                    {...AXIS}
                    allowDecimals={false}
                    width={46}
                    tickFormatter={(v) => withChartUnit(v, "%")}
                    domain={[
                      0,
                      (dataMax: number) => {
                        if (!Number.isFinite(dataMax)) return 1;
                        return dataMax + Math.max(Math.abs(dataMax) * 0.08, 1);
                      },
                    ]}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    cursor={TOOLTIP_CURSOR}
                    formatter={(v, name) => {
                      const series =
                        name === "보상전" || name === "보상 전"
                          ? "보상 전"
                          : "보상 후";
                      return [withChartUnit(String(v ?? ""), "%"), series];
                    }}
                  />
                  <ChartThresholdLines kind="thd" muteDanger={muteThdDanger} />
                  <Bar
                    dataKey="보상전"
                    name="보상 전"
                    fill={CHART_COLORS.accent}
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  >
                    {thdData.map((entry, i) => (
                      <Cell key={i} fill={thdBarColor(entry.보상전, entry.lowLoad)} />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="보상후"
                    name="보상 후"
                    fill={CHART_COLORS.accent}
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  >
                    {thdData.map((entry, i) => (
                      <Cell key={i} fill={thdBarColor(entry.보상후, entry.lowLoad)} />
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
          large={!compactMode}
          fill={fill}
          legend={
            <ul className="pf-power-legend">
              <li>왼쪽 · 보상 전</li>
              <li>오른쪽 · 보상 후</li>
              <li className="pf-power-legend-split" aria-hidden />
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
                  <XAxis
                    dataKey="name"
                    {...AXIS}
                    fontSize={11}
                    tick={<PowerAxisTick />}
                  />
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
                    formatter={(value, name, item) => {
                      const row = String(
                        (item as { payload?: { name?: string } })?.payload
                          ?.name ?? "",
                      );
                      const unit = row.includes("kVA")
                        ? "kVA"
                        : row.includes("kW")
                          ? "kW"
                          : "kvar";
                      const series =
                        name === "보상전" || name === "보상 전"
                          ? "보상 전"
                          : "보상 후";
                      return [withChartUnit(String(value ?? ""), unit), series];
                    }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={1}
                  />
                  <Bar
                    dataKey="보상전"
                    name="보상 전"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  >
                    {powerData.map((entry) => (
                      <Cell
                        key={`pre-${entry.name}`}
                        fill={powerBarFill(entry.name, "before")}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="보상후"
                    name="보상 후"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  >
                    {powerData.map((entry) => (
                      <Cell
                        key={`post-${entry.name}`}
                        fill={powerBarFill(entry.name, "after")}
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
      )}

      {show(["pf"]) && (
        <ChartCard title="역률 (%)" fill={fill}>
          {hasPf(device) ? (
            <div className="pf-tab-gauges">
              <div className="pf-gauge-col">
                <PfNeedleGauge
                  label="TPF"
                  qty="tpf"
                  before={device.tpf1}
                  after={device.tpf2}
                />
                <PfQtyMix
                  kind="tpf"
                  qBefore={device.uncompQ}
                  qAfter={device.compQ}
                  hBefore={device.uncompH}
                  hAfter={device.compH}
                />
              </div>
              <div className="pf-gauge-col">
                <PfNeedleGauge
                  label="DPF"
                  qty="dpf"
                  before={device.dpf1}
                  after={device.dpf2}
                />
                <PfQtyMix
                  kind="dpf"
                  qBefore={device.uncompQ}
                  qAfter={device.compQ}
                />
              </div>
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
                    margin={{
                      top: 8,
                      right: TEMP_CHART_MARGIN_RIGHT,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="ch" {...AXIS} interval={0} />
                    <YAxis
                      {...AXIS}
                      allowDecimals={false}
                      domain={[0, 50]}
                      tickFormatter={(v) => `${v}°C`}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={TOOLTIP_CURSOR}
                      labelFormatter={(l) => `센서 ${l}`}
                      formatter={(v) => [`${v}°C`]}
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
                    {TEMP_THRESHOLDS.areaAlarm != null ? (
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
                    ) : null}
                    <Bar dataKey="온도" radius={[4, 4, 0, 0]} barSize={36}>
                      {areaTempData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.온도 != null &&
                            TEMP_THRESHOLDS.areaAlarm != null &&
                            entry.온도 >= TEMP_THRESHOLDS.areaAlarm
                              ? CHART_COLORS.danger
                              : entry.온도 != null &&
                                  entry.온도 >= TEMP_THRESHOLDS.areaWarn
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
                    margin={{
                      top: 8,
                      right: TEMP_CHART_MARGIN_RIGHT,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="ch" {...AXIS} interval={0} />
                    <YAxis
                      {...AXIS}
                      allowDecimals={false}
                      domain={[0, 150]}
                      tickFormatter={(v) => `${v}°C`}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={TOOLTIP_CURSOR}
                      labelFormatter={(l) => `모듈 ${l}`}
                      formatter={(v) => [`${v}°C`]}
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
                              : TEMP_THRESHOLDS.moduleWarn != null &&
                                  entry.온도 >= TEMP_THRESHOLDS.moduleWarn
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
                    <XAxis dataKey="ch" {...AXIS} interval={0} />
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
                      labelFormatter={(l) => `팬 ${l}`}
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
        </>
      )}
    </div>
  );
}
