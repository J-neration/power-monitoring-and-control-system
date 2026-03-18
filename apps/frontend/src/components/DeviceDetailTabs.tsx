"use client";

import { useState } from "react";
import DeviceDetailChartsLazy from "./DeviceDetailChartsLazy";
import DeviceHistoryCharts from "./DeviceHistoryCharts";
import { StatusCard } from "./StatusCard";
import type { DeviceWithInstallation } from "../types/site";
import type { TelemetryReading } from "../types/site";

type Tab = "monitor" | "analytics";

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const AnalyticsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);

type Props = {
  device: DeviceWithInstallation;
  readings: TelemetryReading[];
  hours: number;
};

export default function DeviceDetailTabs({ device, readings, hours }: Props) {
  const [tab, setTab] = useState<Tab>("monitor");

  return (
    <>
      <div className="device-tab-bar">
        <button
          type="button"
          className={`device-tab-btn${tab === "monitor" ? " active" : ""}`}
          onClick={() => setTab("monitor")}
        >
          <span className="device-tab-icon"><MonitorIcon /></span>
          Monitor
        </button>
        <button
          type="button"
          className={`device-tab-btn${tab === "analytics" ? " active" : ""}`}
          onClick={() => setTab("analytics")}
        >
          <span className="device-tab-icon"><AnalyticsIcon /></span>
          Analytics
        </button>
      </div>

      {tab === "monitor" && (
        <>
          <section className="device-detail-body">
            <DeviceDetailChartsLazy device={device} />
          </section>
          <section className="device-detail-body">
            <StatusCard device={device} />
          </section>
        </>
      )}

      {tab === "analytics" && (
        <section className="device-detail-body">
          <div className="history-section-header">
            <h2 className="history-section-title">
              24시간 이력
              <span className="history-section-sub"> — 최근 {hours}시간</span>
            </h2>
          </div>
          <DeviceHistoryCharts readings={readings} hours={hours} />
        </section>
      )}
    </>
  );
}
