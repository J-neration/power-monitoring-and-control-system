"use client";

import { useMemo } from "react";
import type { AlarmItem } from "../../lib/alarms";
import { formatLastSeen } from "../../lib/lteSignal";
import { alarmKindLabel, isUnacked, type ServerAlarm } from "../../lib/serverAlarms";
import { useHasMounted } from "../../hooks/useHasMounted";

type Props = {
  /** 서버 알람 (GET /alarms) — 띠에 흐르는 항목과 미확인 수의 기준 */
  alarms: ServerAlarm[];
  loaded: boolean;
  /** 현재 장비 상태로 만든 문구 (THD·마지막 수신 등). `${installationId}:${kind}` 로 찾는다 */
  liveAlarms: AlarmItem[];
  soundOn?: boolean;
  onToggleSound?: () => void;
  /** 알람 목록(서랍) 열기 — 확인은 목록에서 한다 */
  onOpenList?: () => void;
};

function detailText(a: ServerAlarm, live: AlarmItem | undefined, mounted: boolean): string {
  if (a.clearedAt) return `${alarmKindLabel(a.kind)} 해제됨`;
  if (!live) return alarmKindLabel(a.kind);
  if (!mounted || !live.lastSeenAt) return live.detail;
  const relative = formatLastSeen(live.lastSeenAt);
  return relative ? `${live.detail} · ${relative}` : live.detail;
}

export default function AlarmTicker({
  alarms,
  loaded,
  liveAlarms,
  soundOn = true,
  onToggleSound,
  onOpenList,
}: Props) {
  const mounted = useHasMounted();
  const liveByKey = useMemo(
    () => new Map(liveAlarms.map((a) => [`${a.id}:${a.status}`, a])),
    [liveAlarms],
  );
  const unackedCount = useMemo(() => alarms.filter(isUnacked).length, [alarms]);

  const soundButton = onToggleSound && (
    <button
      type="button"
      className="alarm-ticker-sound-btn"
      onClick={onToggleSound}
      title={soundOn ? "알람음 끄기" : "알람음 켜기"}
    >
      {soundOn ? "🔔" : "🔕"}
    </button>
  );

  const listButton = onOpenList && (
    <button
      type="button"
      className={`alarm-ticker-list-btn${unackedCount > 0 ? " alarm-ticker-list-btn--unacked" : ""}`}
      onClick={onOpenList}
      title="알람 목록 열기"
    >
      알람 보기{unackedCount > 0 ? ` · 미확인 ${unackedCount}` : ""}
    </button>
  );

  if (!loaded || alarms.length === 0) {
    return (
      <div className="alarm-ticker alarm-ticker--clear">
        <span className="alarm-ticker-icon alarm-ticker-icon--ok" aria-hidden>
          {loaded ? "✓" : "…"}
        </span>
        <span className="alarm-ticker-clear-text">
          {loaded
            ? "현재 이상·오프라인·통신 끊김 알람 없음 — 전체 정상 모니터링 중"
            : "알람 상태 확인 중…"}
        </span>
        <div className="alarm-ticker-controls">
          {soundButton}
          {listButton}
        </div>
      </div>
    );
  }

  const track = [...alarms, ...alarms];

  return (
    <div
      className={`alarm-ticker ${unackedCount > 0 ? "alarm-ticker--active" : "alarm-ticker--acked"}`}
      role="status"
      aria-live="polite"
      aria-label={`알람 ${alarms.length}건, 미확인 ${unackedCount}건`}
    >
      <span className="alarm-ticker-badge">{alarms.length}</span>
      <div className="alarm-ticker-viewport">
        <div
          className="alarm-ticker-track"
          style={{ animationDuration: `${Math.max(alarms.length * 6, 18)}s` }}
        >
          {track.map((a, i) => (
            <span
              key={`${a.id}-${i}`}
              className={[
                "alarm-ticker-item",
                `alarm-ticker-item--${a.kind}`,
                a.clearedAt ? "alarm-ticker-item--cleared" : "",
                a.ackedAt ? "alarm-ticker-item--acked" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <strong>{a.siteName}</strong>
              <span className="alarm-ticker-sep">·</span>
              {a.installationLabel}
              <span className="alarm-ticker-sep">·</span>
              {detailText(a, liveByKey.get(`${a.installationId}:${a.kind}`), mounted)}
              {a.ackedAt && <span className="alarm-ticker-acked-mark"> ✓확인</span>}
            </span>
          ))}
        </div>
      </div>
      <div className="alarm-ticker-controls">
        {soundButton}
        {listButton}
      </div>
    </div>
  );
}
