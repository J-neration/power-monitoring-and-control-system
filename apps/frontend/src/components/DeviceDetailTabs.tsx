"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DeviceHistoryCharts from "./DeviceHistoryCharts";
import DeviceMonitorBoard from "./DeviceMonitorBoard";
import DeviceModulePowerPanel from "./DeviceModulePowerPanel";
import DeviceSettingsPanel from "./DeviceSettingsPanel";
import DeviceSettingsSyncBar from "./DeviceSettingsSyncBar";
import DeviceDataRefreshButton from "./DeviceDataRefreshButton";
import DeviceFaultHistory from "./DeviceFaultHistory";
import ViewingBanner from "./ViewingBanner";
import type { DeviceWithInstallation } from "../types/site";
import type { TelemetryReading } from "../types/site";
import type { FaultEvent } from "../lib/api";
import { useWsEvents } from "../hooks/useWsEvents";
import { useDeviceViewing } from "../hooks/useDeviceViewing";

type Tab = "monitor" | "analytics" | "settings" | "faults";

const MonitorIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const AnalyticsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const FaultIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

type Props = {
  device: DeviceWithInstallation;
  readings: TelemetryReading[];
  hours: number;
  /** ADMIN만 설정·전원 제어 + Fault 이력 표시 */
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

  // Admin on device page → adminSessionActive (HMI command-poll gate).
  // Clears only on logout / tab close (not tab hide).
  const { showBanner } = useDeviceViewing(device.installationId, isAdmin);

  useWsEvents((msg) => {
    if (
      (msg.type === "device_updated" || msg.type === "settings_updated") &&
      msg.installationId === device.installationId
    ) {
      router.refresh();
    }
  });

  const activeFaultCount = faults.filter((f) => f.active).length;
  const hasActiveFaults = activeFaultCount > 0;

  return (
    <div className="device-detail-tabs">
      <div className="device-remote-chrome">
        <div className="device-tab-bar">
          <div className="device-tab-bar-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "monitor"}
              className={`device-tab-btn${tab === "monitor" ? " active" : ""}`}
              onClick={() => setTab("monitor")}
            >
              <span className="device-tab-icon">
                <MonitorIcon />
              </span>
              모니터
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "analytics"}
              className={`device-tab-btn${tab === "analytics" ? " active" : ""}`}
              onClick={() => setTab("analytics")}
            >
              <span className="device-tab-icon">
                <AnalyticsIcon />
              </span>
              이력
            </button>
            {isAdmin && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "settings"}
                className={`device-tab-btn${tab === "settings" ? " active" : ""}`}
                onClick={() => setTab("settings")}
              >
                <span className="device-tab-icon">
                  <SettingsIcon />
                </span>
                설정
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "faults"}
                className={`device-tab-btn${tab === "faults" ? " active" : ""}${hasActiveFaults ? " device-tab-btn-fault" : ""}`}
                onClick={() => setTab("faults")}
              >
                <span className="device-tab-icon">
                  <FaultIcon />
                </span>
                장애
                {hasActiveFaults && (
                  <span className="fault-tab-count">{activeFaultCount}</span>
                )}
              </button>
            )}
          </div>
          {isAdmin && (
            <div className="device-tab-bar-actions">
              <DeviceDataRefreshButton
                installationId={device.installationId}
                requestedBy={adminUsername}
                compact
              />
              {showBanner ? (
                <ViewingBanner installationId={device.installationId} />
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={`device-detail-tab-body${tab === "monitor" ? " device-detail-tab-body--fit" : ""}`}>
      {tab === "monitor" && (
        <DeviceMonitorBoard device={device} readings={readings} />
      )}

      {tab === "analytics" && (
        <section className="device-detail-body">
          <div className="history-section-header">
            <h2 className="history-section-title">최근 {hours}시간 이력</h2>
          </div>
          <DeviceHistoryCharts
            readings={readings}
            hours={hours}
            model={device.model}
            faults={faults}
          />
        </section>
      )}

      {tab === "settings" && isAdmin && (
        <>
          <div className="device-settings-help" role="note">
            <p className="device-settings-help-title">
              설정·모듈 상태는 자동으로 업데이트 되지 않습니다.
            </p>
            <ol className="device-settings-help-list">
              <li>
                이 장치 페이지에 들어와 있으면 원격 세션이 켜집니다. HMI는 다음
                텔레메트리(최대 약 10분) 후 명령을 ~1분 간격으로 받습니다.
                세션은 로그아웃하거나 브라우저 탭을 닫을 때 해제됩니다.
              </li>
              <li>
                아래 <strong>설정값 갱신</strong>을 누르면 HMI가 설정 스냅샷과
                모듈 상태를 한 번 올립니다.
              </li>
              <li>
                모니터 계측값(전압·전류·PF 등)은 <strong>모니터</strong> 화면의{" "}
                <strong>데이터 갱신</strong>을 사용하세요.
              </li>
              <li>
                필드 수정 후 <strong>변경 사항 적용</strong>하면 setBasic 명령이
                가고, 적용 성공 후 스냅샷이 다시 동기화됩니다.
              </li>
            </ol>
          </div>
          <DeviceSettingsSyncBar
            installationId={device.installationId}
            requestedBy={adminUsername}
          />
          <div className="device-settings-layout">
            <DeviceModulePowerPanel
              installationId={device.installationId}
              moduleStatus={device.moduleStatus}
              numOfMods={device.numOfMods}
              requestedBy={adminUsername}
            />
            <DeviceSettingsPanel
              installationId={device.installationId}
              requestedBy={adminUsername}
              numOfMods={device.numOfMods}
            />
          </div>
        </>
      )}

      {tab === "faults" && isAdmin && (
        <DeviceFaultHistory
          installationId={device.installationId}
          faults={faults}
        />
      )}
      </div>
    </div>
  );
}
