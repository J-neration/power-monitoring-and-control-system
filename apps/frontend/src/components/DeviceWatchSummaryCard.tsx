"use client";

import { useMemo } from "react";
import type { DeviceWithInstallation, TelemetryReading } from "../types/site";
import type { FaultEvent } from "../lib/api";
import { buildWatchFacts } from "../lib/watchFacts";
import { extractWatchAnomalies } from "../lib/watchAnomalies";

type Props = {
  device: DeviceWithInstallation;
  readings: TelemetryReading[];
  hours?: number;
  faults?: FaultEvent[];
};

export default function DeviceWatchSummaryCard({
  device,
  readings,
  hours = 24,
  faults = [],
}: Props) {
  const { facts, anomalies } = useMemo(() => {
    const nextFacts = buildWatchFacts({
      installationId: device.installationId,
      hours,
      lastSeenAt: device.lastSeenAt,
      readings,
    });
    const activeFaultCount = faults.filter((f) => f.active).length;
    return {
      facts: nextFacts,
      anomalies: extractWatchAnomalies(nextFacts, { activeFaultCount }),
    };
  }, [device.installationId, device.lastSeenAt, hours, readings, faults]);

  const dangerCount = anomalies.filter((a) => a.level === "danger").length;
  const warnCount = anomalies.filter((a) => a.level === "warn").length;

  return (
    <div className="watch-summary">
      <div className="watch-summary-head">
        <p className="watch-summary-meta">
          최근 {facts.hours}시간 · 측정 {facts.sampleCount}건
        </p>
        <div className="watch-summary-counts">
          {dangerCount > 0 ? (
            <span className="watch-chip watch-chip--danger">위험 {dangerCount}</span>
          ) : null}
          {warnCount > 0 ? (
            <span className="watch-chip watch-chip--warn">주의 {warnCount}</span>
          ) : null}
          {anomalies.length === 0 ? (
            <span className="watch-chip watch-chip--ok">이상 없음</span>
          ) : null}
        </div>
      </div>

      {anomalies.length === 0 ? (
        <p className="watch-summary-empty">
          최근 {facts.hours}시간 규칙 기준으로 이상 징후가 없습니다.
        </p>
      ) : (
        <ul className="watch-summary-list">
          {anomalies.map((a) => (
            <li
              key={a.code}
              className={`watch-summary-item watch-summary-item--${a.level}`}
            >
              <span className="watch-summary-level">
                {a.level === "danger" ? "위험" : "주의"}
              </span>
              <span className="watch-summary-msg">{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
