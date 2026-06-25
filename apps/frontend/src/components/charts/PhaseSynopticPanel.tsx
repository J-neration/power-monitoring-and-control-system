"use client";

import type { Device } from "../../types/site";
import type { TelemetryReading } from "../../types/site";
import MetricValue from "../MetricValue";
import MiniSparkline from "../MiniSparkline";
import { readingSeries } from "../../lib/readingSeries";
import {
  CHART_COLORS,
  THD_THRESHOLDS,
  thdBarColor,
} from "../../lib/chartTheme";
import { getPfLevel, getVoltageLevel } from "../../lib/metricThreshold";

type PhaseRow = {
  label: string;
  l1?: number | null;
  l2?: number | null;
  l3?: number | null;
  kind?: "default" | "thd" | "voltage" | "pf";
  suffix?: string;
  seriesL1: number[];
  seriesL2: number[];
  seriesL3: number[];
  strokeFor: (v: number | null | undefined) => string;
};

type ScalarRow = {
  label: string;
  value?: number | null;
  kind?: "default" | "thd" | "voltage" | "pf";
  suffix?: string;
  series: number[];
  strokeFor: (v: number | null | undefined) => string;
};

function voltageStroke(v: number | null | undefined) {
  const level = getVoltageLevel(v);
  if (level === "danger") return CHART_COLORS.danger;
  if (level === "warn") return CHART_COLORS.warn;
  return CHART_COLORS.accent;
}

function thdStroke(v: number | null | undefined) {
  return thdBarColor(v ?? null);
}

function pfStroke(v: number | null | undefined) {
  const level = getPfLevel(v != null ? Math.abs(v) : v);
  if (level === "danger") return CHART_COLORS.danger;
  if (level === "warn") return CHART_COLORS.warn;
  return CHART_COLORS.accent;
}

function defaultStroke() {
  return CHART_COLORS.accent;
}

function PhaseCell({
  value,
  kind,
  suffix,
  series,
  stroke,
}: {
  value?: number | null;
  kind?: PhaseRow["kind"];
  suffix?: string;
  series: number[];
  stroke: string;
}) {
  return (
    <div className="phase-synoptic-cell">
      <MetricValue value={value} kind={kind} suffix={suffix} digits={kind === "pf" ? 2 : 1} />
      <MiniSparkline values={series} stroke={stroke} width={108} height={22} />
    </div>
  );
}

export default function PhaseSynopticPanel({
  device,
  readings,
}: {
  device: Device;
  readings: TelemetryReading[];
}) {
  const phaseRows: PhaseRow[] = [
    {
      label: "전압 (V)",
      l1: device.vL1,
      l2: device.vL2,
      l3: device.vL3,
      kind: "voltage",
      suffix: " V",
      seriesL1: readingSeries(readings, (r) => r.vL1),
      seriesL2: readingSeries(readings, (r) => r.vL2),
      seriesL3: readingSeries(readings, (r) => r.vL3),
      strokeFor: voltageStroke,
    },
    {
      label: "Load 전류 (A)",
      l1: device.loadCurrentL1,
      l2: device.loadCurrentL2,
      l3: device.loadCurrentL3,
      suffix: " A",
      seriesL1: readingSeries(readings, (r) => r.loadCurrentL1),
      seriesL2: readingSeries(readings, (r) => r.loadCurrentL2),
      seriesL3: readingSeries(readings, (r) => r.loadCurrentL3),
      strokeFor: defaultStroke,
    },
    {
      label: "Grid 전류 (A)",
      l1: device.gridCurrentL1,
      l2: device.gridCurrentL2,
      l3: device.gridCurrentL3,
      suffix: " A",
      seriesL1: readingSeries(readings, (r) => r.gridCurrentL1),
      seriesL2: readingSeries(readings, (r) => r.gridCurrentL2),
      seriesL3: readingSeries(readings, (r) => r.gridCurrentL3),
      strokeFor: defaultStroke,
    },
    {
      label: "Load THD (%)",
      l1: device.loadCurrentTHDL1,
      l2: device.loadCurrentTHDL2,
      l3: device.loadCurrentTHDL3,
      kind: "thd",
      suffix: "%",
      seriesL1: readingSeries(readings, (r) => r.loadCurrentTHDL1),
      seriesL2: readingSeries(readings, (r) => r.loadCurrentTHDL2),
      seriesL3: readingSeries(readings, (r) => r.loadCurrentTHDL3),
      strokeFor: thdStroke,
    },
    {
      label: "Grid THD (%)",
      l1: device.gridCurrentTHDL1,
      l2: device.gridCurrentTHDL2,
      l3: device.gridCurrentTHDL3,
      kind: "thd",
      suffix: "%",
      seriesL1: readingSeries(readings, (r) => r.gridCurrentTHDL1),
      seriesL2: readingSeries(readings, (r) => r.gridCurrentTHDL2),
      seriesL3: readingSeries(readings, (r) => r.gridCurrentTHDL3),
      strokeFor: thdStroke,
    },
  ];

  const scalarRows: ScalarRow[] = [
    {
      label: "TPF Load (%)",
      value: device.tpf1,
      kind: "pf",
      suffix: "%",
      series: readingSeries(readings, (r) => r.tpf1),
      strokeFor: pfStroke,
    },
    {
      label: "TPF Grid (%)",
      value: device.tpf2,
      kind: "pf",
      suffix: "%",
      series: readingSeries(readings, (r) => r.tpf2),
      strokeFor: pfStroke,
    },
    {
      label: "DPF Load (%)",
      value: device.dpf1,
      kind: "pf",
      suffix: "%",
      series: readingSeries(readings, (r) => r.dpf1),
      strokeFor: pfStroke,
    },
    {
      label: "DPF Grid (%)",
      value: device.dpf2,
      kind: "pf",
      suffix: "%",
      series: readingSeries(readings, (r) => r.dpf2),
      strokeFor: pfStroke,
    },
  ];

  return (
    <div className="phase-synoptic-panel">
      <div className="phase-synoptic-legend">
        <span>최근 이력 추세</span>
        <span className="phase-synoptic-thd-hint">
          THD 위험 ≥ {THD_THRESHOLDS.danger}%
        </span>
      </div>
      <div className="phase-synoptic-header">
        <span />
        <span>L1</span>
        <span>L2</span>
        <span>L3</span>
      </div>
      {phaseRows.map((row) => (
        <div key={row.label} className="phase-synoptic-row">
          <span className="phase-synoptic-label">{row.label}</span>
          <PhaseCell
            value={row.l1}
            kind={row.kind}
            suffix={row.suffix}
            series={row.seriesL1}
            stroke={row.strokeFor(row.l1)}
          />
          <PhaseCell
            value={row.l2}
            kind={row.kind}
            suffix={row.suffix}
            series={row.seriesL2}
            stroke={row.strokeFor(row.l2)}
          />
          <PhaseCell
            value={row.l3}
            kind={row.kind}
            suffix={row.suffix}
            series={row.seriesL3}
            stroke={row.strokeFor(row.l3)}
          />
        </div>
      ))}
      <div className="phase-synoptic-scalar-block">
        {scalarRows.map((row) => (
          <div key={row.label} className="phase-synoptic-scalar-row">
            <span className="phase-synoptic-label">{row.label}</span>
            <div className="phase-synoptic-scalar-value">
              <MetricValue
                value={row.value}
                kind={row.kind}
                suffix={row.suffix}
                digits={2}
              />
              <MiniSparkline
                values={row.series}
                stroke={row.strokeFor(row.value)}
                width={160}
                height={22}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
