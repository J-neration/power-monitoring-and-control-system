"use client";

import { fmtChartDateTime } from "../../lib/chartTheme";

type PayloadEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { recordedAt?: string };
};

type Props = {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string | number;
};

export default function ScadaTooltip({ active, payload, label }: Props) {
  if (!active || !payload?.length) return null;

  const recordedAt = payload[0]?.payload?.recordedAt;
  const timeLabel = recordedAt
    ? fmtChartDateTime(recordedAt)
    : String(label ?? "");

  return (
    <div className="scada-chart-tooltip">
      <p className="scada-chart-tooltip-time">{timeLabel}</p>
      <ul className="scada-chart-tooltip-list">
        {payload.map((entry, i) => {
          if (entry.value == null) return null;
          const val =
            typeof entry.value === "number"
              ? entry.value.toFixed(2)
              : entry.value;
          return (
            <li key={i} style={{ color: entry.color ?? "#e2e8f0" }}>
              <span className="scada-chart-tooltip-name">{entry.name}</span>
              <span className="scada-chart-tooltip-val">{val}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
