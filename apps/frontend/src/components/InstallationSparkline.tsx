"use client";

import { useEffect, useState } from "react";
import MiniSparkline from "./MiniSparkline";
import type { TelemetryReading } from "../types/site";

type Props = {
  installationId: string;
  hours?: number;
  metric?: "thd" | "pf";
};

function maxThd(r: TelemetryReading): number | null {
  const vals = [
    r.gridCurrentTHDL1,
    r.gridCurrentTHDL2,
    r.gridCurrentTHDL3,
  ].filter((v): v is number => v != null && Number.isFinite(v));
  return vals.length ? Math.max(...vals) : null;
}

/** Grid-side total power factor (TPF2), percent */
function gridPf(r: TelemetryReading): number | null {
  const v = r.tpf2;
  return v != null && Number.isFinite(v) ? v : null;
}

function pfStrokeColor(values: number[]): string {
  const latest = values[values.length - 1];
  if (latest == null) return "#63b3ed";
  if (latest < 85) return "#f87171";
  if (latest < 90) return "#fbbf24";
  return "#34c759";
}

export default function InstallationSparkline({
  installationId,
  hours = 1,
  metric = "thd",
}: Props) {
  const [values, setValues] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(
      `/api/devices/${encodeURIComponent(installationId)}/readings?hours=${hours}`,
      { cache: "no-store" },
    )
      .then((res) => (res.ok ? res.json() : { readings: [] }))
      .then((data: { readings: TelemetryReading[] }) => {
        if (cancelled) return;
        const readings = [...(data.readings ?? [])].sort(
          (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
        );
        const series = readings
          .map((r) => (metric === "thd" ? maxThd(r) : gridPf(r)))
          .filter((v): v is number => v != null);
        setValues(series.slice(-24));
      })
      .catch(() => {
        if (!cancelled) setValues([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [installationId, hours, metric]);

  const stroke =
    metric === "thd"
      ? values.some((v) => v > 8)
        ? "#f87171"
        : values.some((v) => v > 5)
          ? "#fbbf24"
          : "#34c759"
      : pfStrokeColor(values);

  if (loading) {
    return <div className="mini-sparkline mini-sparkline--loading" aria-hidden />;
  }

  return (
    <MiniSparkline
      values={values}
      stroke={stroke}
      label={metric === "thd" ? "Grid THD 1시간 추세" : "Grid TPF 1시간 추세"}
    />
  );
}
