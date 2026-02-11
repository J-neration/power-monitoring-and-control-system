"use client";

import Link from "next/link";
import type { Device, DeviceStatus } from "../../types/site";

type Props = {
  installationId: string;
  label: string;
  device: Device;
};

const statusColor = (status?: DeviceStatus) => {
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

const fmt = (v: unknown, digits = 3) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(digits) : "-";
  const s = String(v).trim();
  return s.length ? s : "-";
};

export default function InstallationSummaryCard({
  installationId,
  label,
  device,
}: Props) {
  return (
    <Link
      href={`/devices/${encodeURIComponent(installationId)}`}
      className="device-card"
    >
      {/* Header */}
      <div className="device-card-header">
        <div
          className="device-dot"
          style={{ background: statusColor(device.status) }}
        />
        <span className="device-id">{label}</span>
      </div>

      <div className="device-divider" />

      {/* Metrics */}
      <div className="device-metrics">
        <div className="device-metric">
          <span>ID</span>
          <strong>{installationId}</strong>
        </div>

        <div className="device-metric">
          <span>TPF (Grid)</span>
          <strong>{fmt(device.tpf2)}</strong>
        </div>

        <div className="device-metric">
          <span>DPF (Grid)</span>
          <strong>{fmt(device.dpf2)}</strong>
        </div>

        <div className="device-metric">
        <span>THD L1</span>
        <strong>{fmt(device.gridCurrentTHDL1, 2)}</strong>
        </div>

        <div className="device-metric">
        <span>THD L2</span>
        <strong>{fmt(device.gridCurrentTHDL2, 2)}</strong>
        </div>

        <div className="device-metric">
        <span>THD L3</span>
        <strong>{fmt(device.gridCurrentTHDL3, 2)}</strong>
        </div>

      </div>
    </Link>
  );
}
