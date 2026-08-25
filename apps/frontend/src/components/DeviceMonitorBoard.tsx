"use client";

import { useState } from "react";
import type { DeviceWithInstallation } from "../types/site";
import type { TelemetryReading } from "../types/site";
import CompareRingGauge from "./charts/CompareRingGauge";
import PfNeedleGauge from "./charts/PfNeedleGauge";
import CapacitySnapshot from "./CapacitySnapshot";
import DeviceDetailChartsLazy from "./DeviceDetailChartsLazy";
import DeviceOpsBenefitPanel from "./DeviceOpsBenefitPanel";
import { StatusCard } from "./StatusCard";

export type MonitorSection = "overview" | "pf" | "thd" | "unbalance" | "thermal";

const VIEWS: { key: MonitorSection; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "pf", label: "PF" },
  { key: "thd", label: "THD" },
  { key: "unbalance", label: "부하불평형" },
  { key: "thermal", label: "열관리" },
];

export default function DeviceMonitorBoard({
  device,
  readings = [],
}: {
  device: DeviceWithInstallation;
  readings?: TelemetryReading[];
}) {
  const [section, setSection] = useState<MonitorSection>("overview");

  return (
    <div className="device-monitor-board">
      <nav className="monitor-view-nav" aria-label="모니터 화면">
        <span className="monitor-view-nav-label">화면</span>
        <div className="monitor-view-chips" role="tablist">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={section === item.key}
              className={`monitor-view-chip${section === item.key ? " active" : ""}`}
              onClick={() => setSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {section === "overview" ? (
        <div className="device-monitor-overview">
          <div className="hmi-rail">
            <span className="hmi-rail-id">01</span>
            <span className="hmi-rail-label">운용 절감</span>
            <span className="hmi-rail-line" />
            <span className="hmi-rail-note">연간 환산 · 보상 전→후</span>
          </div>
          <DeviceOpsBenefitPanel device={device} readings={readings} />
          <div className="hmi-rail">
            <span className="hmi-rail-id">02</span>
            <span className="hmi-rail-label">실시간 계측</span>
            <span className="hmi-rail-line" />
            <span className="hmi-rail-note">
              회색 점 = 보상 전 · 청록 점 = 보상 후 · 청록 띠 = 이동 · THD 바깥=후 / 안쪽=전
            </span>
          </div>
          <div className="monitor-gauge-grid">
            <PfNeedleGauge
              label="TPF"
              kind="tpf"
              before={device.tpf1}
              after={device.tpf2}
              qBefore={device.uncompQ}
              qAfter={device.compQ}
              hBefore={device.uncompH}
              hAfter={device.compH}
            />
            <PfNeedleGauge
              label="DPF"
              kind="dpf"
              before={device.dpf1}
              after={device.dpf2}
              qBefore={device.uncompQ}
              qAfter={device.compQ}
            />
            <CompareRingGauge
              label="THDi L1"
              before={device.loadCurrentTHDL1}
              after={device.gridCurrentTHDL1}
              kind="thd"
            />
            <CompareRingGauge
              label="THDi L2"
              before={device.loadCurrentTHDL2}
              after={device.gridCurrentTHDL2}
              kind="thd"
            />
            <CompareRingGauge
              label="THDi L3"
              before={device.loadCurrentTHDL3}
              after={device.gridCurrentTHDL3}
              kind="thd"
            />
          </div>
          <div className="device-monitor-overview-cap">
            <div className="hmi-rail">
              <span className="hmi-rail-id">03</span>
              <span className="hmi-rail-label">용량</span>
              <span className="hmi-rail-line" />
            </div>
            <CapacitySnapshot device={device} fill />
          </div>
        </div>
      ) : (
        <div
          className={`device-monitor-layout${section === "pf" ? " device-monitor-layout--charts-only" : ""}`}
        >
          <section className="device-detail-body device-monitor-charts">
            <DeviceDetailChartsLazy device={device} section={section} />
          </section>
          {section === "pf" ? null : (
            <section className="device-detail-body device-monitor-metrics">
              <StatusCard device={device} compact />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
