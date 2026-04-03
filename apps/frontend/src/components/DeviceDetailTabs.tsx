"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DeviceDetailChartsLazy from "./DeviceDetailChartsLazy";
import DeviceHistoryCharts from "./DeviceHistoryCharts";
import DeviceModulePowerPanel from "./DeviceModulePowerPanel";
import DeviceFaultHistory from "./DeviceFaultHistory";
import { StatusCard } from "./StatusCard";
import ViewingBanner from "./ViewingBanner";
import type { DeviceWithInstallation } from "../types/site";
import type { TelemetryReading } from "../types/site";
import type { FaultEvent } from "../lib/api";
import { useWsEvents } from "../hooks/useWsEvents";
import { useDeviceViewing } from "../hooks/useDeviceViewing";

type Tab = "monitor" | "analytics" | "faults";

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

const FaultIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

type Props = {
  device: DeviceWithInstallation;
  readings: TelemetryReading[];
  hours: number;
  /** ADMIN만 모듈 전원 제어 패널 + Fault 이력 표시 */
  isAdmin?: boolean;
  /** 명령 audit용 (로그인 사용자명) */
  adminUsername?: string;
  /** Admin 전용: fault 이력 */
  faults?: FaultEvent[];
};

export default function DeviceDetailTabs({
  device,
  readings,
  hours,
  isAdmin = false,
  adminUsername,
  faults = [],
}: Props) {
  const [tab, setTab] = useState<Tab>("monitor");
  const router = useRouter();

  // Notify the server that this user is actively viewing the device.
  // This enables HMI command polling on the device side.
  const { showBanner, dismissBanner } = useDeviceViewing(device.installationId);

  // Refresh server component data when this installation's device reports in
  useWsEvents((msg) => {
    if (
      msg.type === "device_updated" &&
      msg.installationId === device.installationId
    ) {
      router.refresh();
    }
  });

  const hasFaults = faults.length > 0;

  return (
    <>
      {showBanner && <ViewingBanner onDismiss={dismissBanner} />}
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
        {isAdmin && (
          <button
            type="button"
            className={`device-tab-btn${tab === "faults" ? " active" : ""}${hasFaults ? " device-tab-btn-fault" : ""}`}
            onClick={() => setTab("faults")}
          >
            <span className="device-tab-icon"><FaultIcon /></span>
            Faults
            {hasFaults && <span className="fault-tab-count">{faults.length}</span>}
          </button>
        )}
      </div>

      {tab === "monitor" && (
        <>
          {isAdmin ? (
            <DeviceModulePowerPanel
              installationId={device.installationId}
              moduleStatus={device.moduleStatus}
              numOfMods={device.numOfMods}
              requestedBy={adminUsername}
            />
          ) : null}
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
          <DeviceHistoryCharts readings={readings} hours={hours} model={device.model} />
        </section>
      )}

      {tab === "faults" && isAdmin && (
        <DeviceFaultHistory
          installationId={device.installationId}
          faults={faults}
        />
      )}
    </>
  );
}
