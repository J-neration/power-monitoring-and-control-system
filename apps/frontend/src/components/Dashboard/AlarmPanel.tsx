"use client";

import type { AlarmItem } from "../../lib/alarms";
import { formatLastSeen } from "../../lib/lteSignal";
import { useHasMounted } from "../../hooks/useHasMounted";

type Props = {
  alarms: AlarmItem[];
  unackedCount: number;
  isAcked: (key: string) => boolean;
  onAck: (key: string) => void;
  onAckAll: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onSelectSite?: (siteId: string) => void;
  selectedSiteId?: string;
};

function alarmDetailText(item: AlarmItem, mounted: boolean): string {
  if (!mounted || !item.lastSeenAt) return item.detail;
  const relative = formatLastSeen(item.lastSeenAt);
  return relative ? `${item.detail} · ${relative}` : item.detail;
}

export default function AlarmPanel({
  alarms,
  unackedCount,
  isAcked,
  onAck,
  onAckAll,
  soundOn,
  onToggleSound,
  onSelectSite,
  selectedSiteId,
}: Props) {
  const mounted = useHasMounted();

  if (alarms.length === 0) {
    return (
      <div className="alarm-panel alarm-panel--empty">
        <p>활성 알람이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="alarm-panel">
      <div className="alarm-panel-head">
        <h3 className="alarm-panel-title">
          알람 목록
          {unackedCount > 0 && (
            <span className="alarm-panel-unacked">{unackedCount} 미확인</span>
          )}
        </h3>
        <div className="alarm-panel-actions">
          <button
            type="button"
            className="alarm-action-btn"
            onClick={onToggleSound}
            title={soundOn ? "알람음 끄기" : "알람음 켜기"}
          >
            {soundOn ? "🔔" : "🔕"}
          </button>
          {unackedCount > 0 && (
            <button type="button" className="alarm-action-btn" onClick={onAckAll}>
              전체 확인
            </button>
          )}
        </div>
      </div>

      <ul className="alarm-panel-list">
        {alarms.map((item) => {
          const acked = isAcked(item.ackKey);
          return (
            <li
              key={item.ackKey}
              className={`alarm-panel-item alarm-panel-item--${item.status}${acked ? " acked" : ""}${selectedSiteId === item.siteId ? " selected" : ""}`}
            >
              <button
                type="button"
                className="alarm-panel-item-main alarm-panel-item-select"
                onClick={() => onSelectSite?.(item.siteId)}
              >
                <span className="alarm-panel-status">
                  {item.status === "fault" ? "이상" : "오프라인"}
                </span>
                <strong>{item.siteName}</strong>
                <span className="alarm-panel-sep">·</span>
                {item.instLabel}
                <p className="alarm-panel-detail">
                  {alarmDetailText(item, mounted)}
                </p>
              </button>
              {!acked && (
                <button
                  type="button"
                  className="alarm-ack-btn"
                  onClick={() => onAck(item.ackKey)}
                >
                  확인
                </button>
              )}
              {acked && <span className="alarm-acked-label">확인됨</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
