"use client";

function SignalBars() {
  return (
    <span className="lte-monitor-bars" aria-hidden="true">
      {[1, 2, 3, 4].map((bar) => (
        <span key={bar} className={`lte-monitor-bar-seg lte-monitor-bar-seg-${bar}`} />
      ))}
    </span>
  );
}

/** 지도 LTE 관제 오버레이 — 스캔·신호바·파형으로 송수신 상태 표시 */
export default function LteRadarOverlay() {
  return (
    <div className="lte-monitor-overlay" aria-hidden="true">
      <div className="lte-monitor-grid" />
      <div className="lte-monitor-scanline" />

      <div className="lte-monitor-badge">
        <SignalBars />
        <span className="lte-monitor-badge-label">LTE 무선 송수신</span>
        <span className="lte-monitor-badge-sub">관제 감지 중</span>
        <span className="lte-monitor-dot lte-monitor-dot--live" />
      </div>

      <div className="lte-monitor-footer">
        <svg
          className="lte-monitor-wave"
          viewBox="0 0 160 20"
          preserveAspectRatio="none"
        >
          <path
            className="lte-monitor-wave-path"
            d="M0 10 C20 10 20 4 40 4 S60 16 80 16 100 4 120 4 140 16 160 16"
          />
        </svg>
      </div>
    </div>
  );
}
