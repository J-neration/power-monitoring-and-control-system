"use client";

import { useMemo } from "react";
import type { Site } from "../../types/site";
import { buildAlarms } from "../../lib/alarms";

type Props = {
  sites: Site[];
  unackedCount?: number;
  soundOn?: boolean;
  onToggleSound?: () => void;
  onAckAll?: () => void;
};

export default function AlarmTicker({
  sites,
  unackedCount = 0,
  soundOn = true,
  onToggleSound,
  onAckAll,
}: Props) {
  const alarms = useMemo(() => buildAlarms(sites), [sites]);

  if (alarms.length === 0) {
    return (
      <div className="alarm-ticker alarm-ticker--clear">
        <span className="alarm-ticker-icon alarm-ticker-icon--ok" aria-hidden>
          ✓
        </span>
        <span className="alarm-ticker-clear-text">
          현재 이상·오프라인 알람 없음 — 전체 정상 모니터링 중
        </span>
        {onToggleSound && (
          <button
            type="button"
            className="alarm-ticker-sound-btn"
            onClick={onToggleSound}
            title={soundOn ? "알람음 끄기" : "알람음 켜기"}
          >
            {soundOn ? "🔔" : "🔕"}
          </button>
        )}
      </div>
    );
  }

  const track = [...alarms, ...alarms];

  return (
    <div
      className="alarm-ticker alarm-ticker--active"
      role="status"
      aria-live="polite"
      aria-label={`알람 ${alarms.length}건, 미확인 ${unackedCount}건`}
    >
      <span className="alarm-ticker-badge">{alarms.length}</span>
      {unackedCount > 0 && (
        <span className="alarm-ticker-unacked">{unackedCount} 미확인</span>
      )}
      <div className="alarm-ticker-viewport">
        <div
          className="alarm-ticker-track"
          style={{ animationDuration: `${Math.max(alarms.length * 6, 18)}s` }}
        >
          {track.map((item, i) => (
            <span
              key={`${item.ackKey}-${i}`}
              className={`alarm-ticker-item alarm-ticker-item--${item.status}`}
            >
              <strong>{item.siteName}</strong>
              <span className="alarm-ticker-sep">·</span>
              {item.instLabel}
              <span className="alarm-ticker-sep">·</span>
              {item.detail}
            </span>
          ))}
        </div>
      </div>
      <div className="alarm-ticker-controls">
        {onToggleSound && (
          <button
            type="button"
            className="alarm-ticker-sound-btn"
            onClick={onToggleSound}
            title={soundOn ? "알람음 끄기" : "알람음 켜기"}
          >
            {soundOn ? "🔔" : "🔕"}
          </button>
        )}
        {unackedCount > 0 && onAckAll && (
          <button type="button" className="alarm-ticker-ack-btn" onClick={onAckAll}>
            전체 확인
          </button>
        )}
      </div>
    </div>
  );
}
