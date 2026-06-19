"use client";

import type { DashboardLayout } from "../../hooks/useControlRoomMode";

type Props = {
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
  controlRoom: boolean;
  onToggleControlRoom: () => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  rotateSec: number;
};

const LAYOUTS: { id: DashboardLayout; label: string }[] = [
  { id: "default", label: "기본" },
  { id: "map", label: "지도" },
  { id: "alarm", label: "알람" },
];

export default function ControlRoomToolbar({
  layout,
  onLayoutChange,
  controlRoom,
  onToggleControlRoom,
  autoRotate,
  onToggleAutoRotate,
  rotateSec,
}: Props) {
  return (
    <div className="control-room-toolbar" role="toolbar" aria-label="관제 화면 설정">
      <button
        type="button"
        className={`cr-btn cr-btn--primary${controlRoom ? " active" : ""}`}
        onClick={onToggleControlRoom}
        title="브라우저 전체화면 + UI 최소화"
      >
        {controlRoom ? "관제 종료" : "관제 모드"}
      </button>

      <span className="cr-divider" aria-hidden />

      {LAYOUTS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`cr-btn${layout === item.id ? " active" : ""}`}
          onClick={() => onLayoutChange(item.id)}
        >
          {item.label}
        </button>
      ))}

      <span className="cr-divider" aria-hidden />

      <button
        type="button"
        className={`cr-btn${autoRotate ? " active" : ""}`}
        onClick={onToggleAutoRotate}
        title={`현장 ${rotateSec}초마다 자동 전환`}
      >
        {autoRotate ? `순환 ON (${rotateSec}s)` : "현장 순환"}
      </button>
    </div>
  );
}
