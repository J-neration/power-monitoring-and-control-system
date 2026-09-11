"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeviceWithInstallation, TelemetryReading } from "../types/site";
import type { FaultEvent } from "../lib/api";
import { buildWatchFacts } from "../lib/watchFacts";
import { extractWatchAnomalies } from "../lib/watchAnomalies";
import {
  dismissedCodesFor,
  dismissAllWatchAlerts,
  dismissWatchAlert,
  loadWatchAckStore,
  pruneWatchAck,
  restoreWatchAlerts,
  type WatchAckStore,
} from "../lib/watchAck";

type Props = {
  device: DeviceWithInstallation;
  readings: TelemetryReading[];
  hours?: number;
  faults?: FaultEvent[];
};

function formatWatchAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DeviceWatchSummaryCard({
  device,
  readings,
  hours = 24,
  faults = [],
}: Props) {
  const installationId = device.installationId;
  const [ackStore, setAckStore] = useState<WatchAckStore>({});

  useEffect(() => {
    setAckStore(loadWatchAckStore());
  }, []);

  const { facts, anomalies } = useMemo(() => {
    const nextFacts = buildWatchFacts({
      installationId,
      hours,
      lastSeenAt: device.lastSeenAt,
      readings,
    });
    const activeFaultCount = faults.filter((f) => f.active).length;
    return {
      facts: nextFacts,
      anomalies: extractWatchAnomalies(nextFacts, { activeFaultCount }),
    };
  }, [installationId, device.lastSeenAt, hours, readings, faults]);

  const activeCodes = useMemo(
    () => anomalies.map((a) => a.code),
    [anomalies],
  );
  const activeCodeKey = activeCodes.join("\0");

  useEffect(() => {
    const next = pruneWatchAck(
      installationId,
      activeCodeKey ? activeCodeKey.split("\0") : [],
    );
    setAckStore((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [installationId, activeCodeKey]);

  const dismissed = dismissedCodesFor(ackStore, installationId);
  const visible = anomalies.filter((a) => !dismissed.includes(a.code));
  const hiddenCount = anomalies.length - visible.length;

  const dangerCount = visible.filter((a) => a.level === "danger").length;
  const warnCount = visible.filter((a) => a.level === "warn").length;

  const dismissOne = useCallback(
    (code: string) => {
      setAckStore(dismissWatchAlert(installationId, code));
    },
    [installationId],
  );

  const dismissAll = useCallback(() => {
    setAckStore(dismissAllWatchAlerts(installationId, activeCodes));
  }, [installationId, activeCodes]);

  const restoreAll = useCallback(() => {
    setAckStore(restoreWatchAlerts(installationId));
  }, [installationId]);

  return (
    <div className="watch-summary">
      <div className="watch-summary-head">
        <p className="watch-summary-meta">최근 {facts.hours}시간 이력</p>
        <div className="watch-summary-counts">
          {dangerCount > 0 ? (
            <span className="watch-chip watch-chip--danger">
              위험 {dangerCount}
            </span>
          ) : null}
          {warnCount > 0 ? (
            <span className="watch-chip watch-chip--warn">
              주의 {warnCount}
            </span>
          ) : null}
          {visible.length === 0 && anomalies.length === 0 ? (
            <span className="watch-chip watch-chip--ok">이상 없음</span>
          ) : null}
          {visible.length > 0 || hiddenCount > 0 ? (
            <div className="watch-summary-actions">
              {visible.length > 0 ? (
                <button
                  type="button"
                  className="watch-summary-action"
                  onClick={dismissAll}
                >
                  모두 지우기
                </button>
              ) : null}
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  className="watch-summary-action"
                  onClick={restoreAll}
                >
                  숨긴 알림 {hiddenCount}건
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="watch-summary-empty">
          {anomalies.length === 0
            ? `최근 ${facts.hours}시간 동안 기준을 넘긴 적이 없습니다.`
            : "알림을 모두 지웠습니다. 숨긴 알림을 누르면 다시 볼 수 있습니다."}
        </p>
      ) : (
        <ul className="watch-summary-list">
          {visible.map((a) => (
            <li
              key={a.code}
              className={`watch-summary-item watch-summary-item--${a.level}`}
            >
              <span className="watch-summary-level">
                {a.level === "danger" ? "위험" : "주의"}
              </span>
              <div className="watch-summary-copy">
                <span className="watch-summary-scope">
                  {a.scope === "now" ? "지금" : `최근 ${facts.hours}시간`}
                </span>
                <span className="watch-summary-title">{a.title}</span>
                <span className="watch-summary-msg">{a.message}</span>
                {a.at ? (
                  <span className="watch-summary-when">{formatWatchAt(a.at)}</span>
                ) : null}
              </div>
              <button
                type="button"
                className="watch-summary-dismiss"
                aria-label={`${a.title} 알림 지우기`}
                onClick={() => dismissOne(a.code)}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
