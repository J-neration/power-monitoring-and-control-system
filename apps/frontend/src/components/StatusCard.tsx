import type { ReactNode } from "react";
import type { DeviceWithInstallation } from "../types/site";
import MetricValue from "./MetricValue";
import ModuleSlotGrid from "./ModuleSlotGrid";
import { TEMP_THRESHOLDS } from "../lib/chartTheme";

type StatusCardProps = {
  device: DeviceWithInstallation;
  compact?: boolean;
};

function maxOf(values?: number[] | null): number | null {
  const xs = (values ?? []).filter((v) => Number.isFinite(v));
  return xs.length ? Math.max(...xs) : null;
}

function HealthCell({
  label,
  value,
  suffix,
  warn,
  alarm,
}: {
  label: string;
  value: number | null;
  suffix: string;
  warn?: number;
  alarm?: number;
}) {
  const tone =
    value != null && alarm != null && value >= alarm
      ? "danger"
      : value != null && warn != null && value >= warn
        ? "warn"
        : "ok";
  return (
    <div className={`device-health-cell device-health-cell--${tone}`}>
      <span className="device-health-label">{label}</span>
      <span className="device-health-value">
        {value != null ? `${value.toFixed(0)}${suffix}` : "—"}
      </span>
    </div>
  );
}

function MetricCell({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: ReactNode;
  colSpan?: number;
}) {
  return (
    <tr>
      <td className="detail-metrics-label">{label}</td>
      {colSpan ? (
        <td className="detail-metrics-value" colSpan={colSpan}>
          {children}
        </td>
      ) : (
        children
      )}
    </tr>
  );
}

export function StatusCard({ device, compact = false }: StatusCardProps) {
  return (
    <article className="scada-metrics-panel">
      <div className="scada-metrics-grid">
        <table className="detail-metrics-table">
          <thead>
            <tr>
              <th className="detail-metrics-label">
                <span className="metrics-chip metrics-chip-load">Load</span>
              </th>
              <th className="detail-metrics-value">L1</th>
              <th className="detail-metrics-value">L2</th>
              <th className="detail-metrics-value">L3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="detail-metrics-label">전류 (A)</td>
              <td className="detail-metrics-value">
                <MetricValue value={device.loadCurrentL1} />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.loadCurrentL2} />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.loadCurrentL3} />
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">THD (%)</td>
              <td className="detail-metrics-value">
                <MetricValue value={device.loadCurrentTHDL1} kind="thd" />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.loadCurrentTHDL2} kind="thd" />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.loadCurrentTHDL3} kind="thd" />
              </td>
            </tr>
            <MetricCell label="TPF (%)" colSpan={3}>
              <MetricValue value={device.tpf1} kind="pf" suffix="%" digits={2} />
            </MetricCell>
            <MetricCell label="DPF (%)" colSpan={3}>
              <MetricValue value={device.dpf1} kind="pf" suffix="%" digits={2} />
            </MetricCell>
            {!compact && (
              <>
                <MetricCell label="S (kVA)" colSpan={3}>
                  <MetricValue value={device.uncompS} digits={2} />
                </MetricCell>
                <MetricCell label="P (kW)" colSpan={3}>
                  <MetricValue value={device.uncompP} digits={2} />
                </MetricCell>
                <MetricCell label="Q (kvar)" colSpan={3}>
                  <MetricValue value={device.uncompQ} digits={2} />
                </MetricCell>
              </>
            )}
          </tbody>
        </table>

        <table className="detail-metrics-table">
          <thead>
            <tr>
              <th className="detail-metrics-label">
                <span className="metrics-chip metrics-chip-grid">Grid</span>
              </th>
              <th className="detail-metrics-value">L1</th>
              <th className="detail-metrics-value">L2</th>
              <th className="detail-metrics-value">L3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="detail-metrics-label">전류 (A)</td>
              <td className="detail-metrics-value">
                <MetricValue value={device.gridCurrentL1} />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.gridCurrentL2} />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.gridCurrentL3} />
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">THD (%)</td>
              <td className="detail-metrics-value">
                <MetricValue value={device.gridCurrentTHDL1} kind="thd" />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.gridCurrentTHDL2} kind="thd" />
              </td>
              <td className="detail-metrics-value">
                <MetricValue value={device.gridCurrentTHDL3} kind="thd" />
              </td>
            </tr>
            <MetricCell label="TPF (%)" colSpan={3}>
              <MetricValue value={device.tpf2} kind="pf" suffix="%" digits={2} />
            </MetricCell>
            <MetricCell label="DPF (%)" colSpan={3}>
              <MetricValue value={device.dpf2} kind="pf" suffix="%" digits={2} />
            </MetricCell>
            {!compact && (
              <>
                <MetricCell label="S (kVA)" colSpan={3}>
                  <MetricValue value={device.compS} digits={2} />
                </MetricCell>
                <MetricCell label="P (kW)" colSpan={3}>
                  <MetricValue value={device.compP} digits={2} />
                </MetricCell>
                <MetricCell label="Q (kvar)" colSpan={3}>
                  <MetricValue value={device.compQ} digits={2} />
                </MetricCell>
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="scada-metrics-footer">
        <div className="detail-voltage">
          <span>전압 (V)</span>
          <strong>
            L1 <MetricValue value={device.vL1} kind="voltage" /> / L2{" "}
            <MetricValue value={device.vL2} kind="voltage" /> / L3{" "}
            <MetricValue value={device.vL3} kind="voltage" />
          </strong>
        </div>
      </div>

      <div className="device-health-strip" aria-label="설비 상태">
        <HealthCell
          label="주위"
          value={maxOf(device.areaTemp)}
          suffix="°"
          warn={TEMP_THRESHOLDS.areaWarn}
          alarm={TEMP_THRESHOLDS.areaAlarm}
        />
        <HealthCell
          label="모듈"
          value={maxOf(device.moduleTemp)}
          suffix="°"
          warn={TEMP_THRESHOLDS.moduleWarn}
          alarm={TEMP_THRESHOLDS.moduleAlarm}
        />
        <HealthCell
          label="팬"
          value={maxOf(device.fanSpeed)}
          suffix=" m/s"
        />
        <HealthCell
          label="용량"
          value={
            device.operatingCapacity ?? device.totalCapacity ?? device.capacity ?? null
          }
          suffix={device.model === "paf" ? "A" : "kvar"}
        />
      </div>

      <ModuleSlotGrid
        moduleStatus={device.moduleStatus}
        numOfMods={device.numOfMods}
      />
    </article>
  );
}
