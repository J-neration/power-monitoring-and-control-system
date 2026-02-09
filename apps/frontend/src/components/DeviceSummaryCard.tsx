import Link from "next/link";
import { Device } from "../types/device";

type DeviceSummaryCardProps = {
  device: Device;
};

const statusColors: Record<Device["status"], string> = {
  standby: "#f1c40f",
  start: "#f1c40f",
  running: "#2ecc71",
  fault: "#e74c3c",
  offline: "#9aa4b2",
};

const toNumber = (value?: number | string) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatNumber = (value?: number | string, digits = 1) => {
  const parsed = toNumber(value);
  if (parsed === undefined) {
    return "-";
  }
  return parsed.toFixed(digits);
};

const averageOf = (values: Array<number | string | undefined>) => {
  const numeric = values
    .map((value) => toNumber(value))
    .filter((value): value is number => value !== undefined);
  if (numeric.length === 0) {
    return undefined;
  }
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
};

export const DeviceSummaryCard = ({ device }: DeviceSummaryCardProps) => {
  const deviceHref = `/devices/${encodeURIComponent(device.id)}`;
  const tpf = device.tpf2 ?? device.tpf1;
  const dpf = device.dpf2 ?? device.dpf1;
  const thd =
    averageOf([
      device.gridCurrentTHDL1,
      device.gridCurrentTHDL2,
      device.gridCurrentTHDL3,
    ]) ??
    averageOf([
      device.loadCurrentTHDL1,
      device.loadCurrentTHDL2,
      device.loadCurrentTHDL3,
    ]);

  return (
    <Link className="device-card" href={deviceHref}>
      <div className="device-card-header">
        <span
          className="device-dot"
          style={{ background: statusColors[device.status] }}
        />
        <span className="device-id">{device.id}</span>
      </div>
      <div className="device-name">{device.name}</div>
      <div className="device-divider" />
      <div className="device-metrics">
        <div className="device-metric">
          <span>TPF</span>
          <strong>{formatNumber(tpf, 3)}%</strong>
        </div>
        <div className="device-metric">
          <span>DPF</span>
          <strong>{formatNumber(dpf, 3)}%</strong>
        </div>
        <div className="device-metric">
          <span>THD</span>
          <strong>{formatNumber(thd, 1)}%</strong>
        </div>
      </div>
    </Link>
  );
};
