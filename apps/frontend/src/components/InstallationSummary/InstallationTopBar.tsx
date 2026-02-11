"use client";
import "./InstallationTopBar.css";
import { DeviceStatus } from "../../types/site";

type Summary = { total: number; ok: number; check: number; fault: number };


type Props = {
    name: string;
    address: string;
    lastUpdatedText: string;
    status?: DeviceStatus;   // ← 여기
    summary: Summary;
  };

const dotColor = (status?: DeviceStatus) => {
    switch (status) {
      case "fault":
        return "#f24141";
      case "offline":
        return "#6b7280";
      case "standby":
      case "start":
        return "#ffcc00";
      case "running":
      default:
        return "#2ecc71";
    }
  };
  
export default function InstallationTopBar({
  name,
  address,
  lastUpdatedText,
  status = "running",
  summary,
}: Props) {
  return (
    <section className="topbar">
      {/* LEFT */}
      <div className="topbar-left">
        <div className="topbar-title-row">
          <span
            className="topbar-dot"
            style={{ backgroundColor: dotColor(status) }}
          />
          <h1 className="topbar-title">{name}</h1>
        </div>

        <div className="topbar-sub">
          <div className="topbar-sub-line">{address}</div>
          <div className="topbar-sub-line">마지막 업데이트 : {lastUpdatedText}</div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="topbar-right">
        <div className="stat-card stat-total">
          <div className="stat-label">합계</div>
          <div className="stat-value">{summary.total}</div>
        </div>

        <div className="stat-card stat-normal">
          <div className="stat-label">정상</div>
          <div className="stat-value">{summary.ok}</div>
        </div>

        <div className="stat-card stat-check">
          <div className="stat-label">점검 필요</div>
          <div className="stat-value">{summary.check}</div>
        </div>

        <div className="stat-card stat-fault">
          <div className="stat-label">고장</div>
          <div className="stat-value">{summary.fault}</div>
        </div>
      </div>

      {/* bottom divider like image */}
      <div className="topbar-divider" />
    </section>
  );
}
