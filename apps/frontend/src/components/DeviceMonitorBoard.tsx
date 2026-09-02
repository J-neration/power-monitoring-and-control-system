"use client";

import { useState } from "react";
import type { DeviceWithInstallation } from "../types/site";
import type { TelemetryReading } from "../types/site";
import PfNeedleGauge from "./charts/PfNeedleGauge";
import ThdArcGauge from "./charts/ThdArcGauge";
import CapacitySnapshot from "./CapacitySnapshot";
import DeviceDetailChartsLazy from "./DeviceDetailChartsLazy";
import DeviceOpsBenefitPanel from "./DeviceOpsBenefitPanel";
import DeviceCompareTable from "./DeviceCompareTable";
import ModuleSlotGrid from "./ModuleSlotGrid";
import ThermalSummaryPanel from "./ThermalSummaryPanel";

export type MonitorSection =
  | "overview"
  | "pf"
  | "thd"
  | "unbalance"
  | "thermal"
  | "data";

const VIEWS: { key: MonitorSection; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "pf", label: "PF" },
  { key: "thd", label: "THD" },
  { key: "unbalance", label: "부하불평형" },
  { key: "thermal", label: "열관리" },
  { key: "data", label: "데이터" },
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
        <ModuleSlotGrid
          compact
          className="module-slot-grid--nav"
          moduleStatus={device.moduleStatus}
          numOfMods={device.numOfMods}
        />
      </nav>

      {section === "overview" ? (
        <div className="device-monitor-overview">
          <div className="hmi-rail">
            <span className="hmi-rail-id">01</span>
            <span className="hmi-rail-label">운용 절감</span>
            <span className="hmi-rail-line" />
          </div>
          <DeviceOpsBenefitPanel device={device} readings={readings} />
          <div className="hmi-rail">
            <span className="hmi-rail-id">02</span>
            <span className="hmi-rail-label">실시간 계측</span>
            <span className="hmi-rail-line" />
          </div>
          <div className="monitor-gauge-grid">
            <PfNeedleGauge
              label="TPF"
              before={device.tpf1}
              after={device.tpf2}
            />
            <PfNeedleGauge
              label="DPF"
              before={device.dpf1}
              after={device.dpf2}
            />
            <ThdArcGauge
              label="THDi L1"
              before={device.loadCurrentTHDL1}
              after={device.gridCurrentTHDL1}
            />
            <ThdArcGauge
              label="THDi L2"
              before={device.loadCurrentTHDL2}
              after={device.gridCurrentTHDL2}
            />
            <ThdArcGauge
              label="THDi L3"
              before={device.loadCurrentTHDL3}
              after={device.gridCurrentTHDL3}
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
      ) : section === "data" ? (
        <section className="device-monitor-data">
          <DeviceCompareTable device={device} />
        </section>
      ) : (
        <div
          className={`device-monitor-layout${section === "pf" || section === "thd" || section === "unbalance" ? " device-monitor-layout--charts-only" : ""}`}
        >
          <section className="device-detail-body device-monitor-charts">
            <DeviceDetailChartsLazy device={device} section={section} />
          </section>
          {section === "thermal" ? (
            <section className="device-detail-body device-monitor-metrics">
              <ThermalSummaryPanel device={device} readings={readings} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
