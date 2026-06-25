"use client";

import type { DeviceWithInstallation } from "../types/site";
import type { TelemetryReading } from "../types/site";
import ChartCard from "./charts/ChartCard";
import PhaseSynopticPanel from "./charts/PhaseSynopticPanel";
import ModuleSlotGrid from "./ModuleSlotGrid";
import MetricValue from "./MetricValue";

function hasCapTelemetry(device: DeviceWithInstallation) {
  return (
    device.totalCapacity != null ||
    device.operatingCapacity != null ||
    device.reactivePowerCapacity != null ||
    device.availableMargin != null
  );
}

function CapacityMini({ device }: { device: DeviceWithInstallation }) {
  const capUnit = device.model === "paf" ? "A" : "kvar";
  const capOk = hasCapTelemetry(device);
  const totalCap = device.totalCapacity ?? device.capacity ?? null;
  const opCap = device.operatingCapacity ?? null;
  const rpCap = device.reactivePowerCapacity ?? null;
  const margin =
    device.availableMargin ??
    (totalCap != null && opCap != null ? totalCap - opCap : null);

  if (!capOk || totalCap == null) {
    return (
      <div className="device-cap-mini device-cap-mini--empty">
        <span className="device-cap-mini-title">용량</span>
        <span className="device-cap-mini-muted">—</span>
      </div>
    );
  }

  const rpPct = totalCap > 0 && rpCap != null ? (rpCap / totalCap) * 100 : 0;
  const opPct = totalCap > 0 && opCap != null ? (opCap / totalCap) * 100 : 0;

  return (
    <div className="device-cap-mini">
      <span className="device-cap-mini-title">용량 ({capUnit})</span>
      <div className="device-cap-mini-bar">
        <div
          className="device-cap-mini-seg device-cap-mini-seg--rp"
          style={{ width: `${Math.min(100, rpPct)}%` }}
          title={`무효 ${rpCap ?? "—"}`}
        />
        <div
          className="device-cap-mini-seg device-cap-mini-seg--op"
          style={{ width: `${Math.min(100, Math.max(0, opPct - rpPct))}%` }}
          title={`운전 ${opCap ?? "—"}`}
        />
      </div>
      <div className="device-cap-mini-stats">
        <span>총 {totalCap}</span>
        <span>운전 {opCap ?? "—"}</span>
        <span>여유 {margin ?? "—"}</span>
      </div>
    </div>
  );
}

export default function DeviceMonitorSynoptic({
  device,
  readings,
}: {
  device: DeviceWithInstallation;
  readings: TelemetryReading[];
}) {
  return (
    <section className="device-monitor-synoptic">
      <div className="device-synoptic-top">
        <div className="device-synoptic-modules scada-panel">
          <span className="device-synoptic-block-title">모듈 상태</span>
          <ModuleSlotGrid
            moduleStatus={device.moduleStatus}
            numOfMods={device.numOfMods}
          />
        </div>
        <div className="device-synoptic-capacity scada-panel">
          <CapacityMini device={device} />
        </div>
      </div>

      <ChartCard title="상별 실시간 계측" subtitle="— 숫자 + 최근 추세" wide>
        <PhaseSynopticPanel device={device} readings={readings} />
      </ChartCard>

      <div className="device-synoptic-power scada-panel">
        <div className="device-synoptic-power-col">
          <span className="metrics-chip metrics-chip-load">Load</span>
          <div className="device-synoptic-power-metrics">
            <span>
              P <MetricValue value={device.uncompP} digits={2} suffix=" kW" />
            </span>
            <span>
              Q <MetricValue value={device.uncompQ} digits={2} suffix=" kvar" />
            </span>
            <span>
              S <MetricValue value={device.uncompS} digits={2} suffix=" kVA" />
            </span>
          </div>
        </div>
        <div className="device-synoptic-power-col">
          <span className="metrics-chip metrics-chip-grid">Grid</span>
          <div className="device-synoptic-power-metrics">
            <span>
              P <MetricValue value={device.compP} digits={2} suffix=" kW" />
            </span>
            <span>
              Q <MetricValue value={device.compQ} digits={2} suffix=" kvar" />
            </span>
            <span>
              S <MetricValue value={device.compS} digits={2} suffix=" kVA" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
