"use client";

import { fmtChartDateTime, withChartUnit } from "../../lib/chartTheme";

type PayloadEntry = {
  name?: string;
  value?: number | string | null;
  color?: string;
  payload?: { recordedAt?: string; gap?: boolean };
};

type Props = {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string | number;
  unit?: string;
};

export default function ScadaTooltip({ active, payload, label, unit }: Props) {
  if (!active || !payload?.length) return null;

  const recordedAt = payload[0]?.payload?.recordedAt;
  const timeLabel = recordedAt
    ? fmtChartDateTime(recordedAt)
    : String(label ?? "");
  const missing =
    payload[0]?.payload?.gap === true ||
    payload.every((entry) => entry.value == null || entry.value === "");

  return (
    <div className="scada-chart-tooltip">
      <p className="scada-chart-tooltip-time">{timeLabel}</p>
      {missing ? <p className="scada-chart-tooltip-missing">데이터 없음</p> : null}
      <ul className="scada-chart-tooltip-list">
        {payload.map((entry, i) => {
          if (entry.value == null || entry.value === "") return null;
          const val =
            typeof entry.value === "number"
              ? entry.value.toFixed(2)
              : entry.value;
          return (
            <li key={i} style={{ color: entry.color ?? "#e2e8f0" }}>
              <span className="scada-chart-tooltip-name">{entry.name}</span>
              <span className="scada-chart-tooltip-val">
                {withChartUnit(val, unit)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
