import { Device } from "../types/device";

type StatusCardProps = {
  device: Device;
};

const statusColors: Record<Device["status"], string> = {
  standby: "#9aa4b2",
  start: "#3498db",
  running: "#2ecc71",
  fault: "#e74c3c",
  offline: "#6b7280",
};

const moduleStatusMeta: Record<number, { label: string; className: string }> = {
  0: { label: "STANDBY", className: "module-chip-standby" },
  1: { label: "START", className: "module-chip-start" },
  2: { label: "RUNNING", className: "module-chip-running" },
  3: { label: "FAULT", className: "module-chip-fault" },
  4: { label: "OFFLINE", className: "module-chip-offline" },
};

export const StatusCard = ({ device }: StatusCardProps) => {
  return (
    <article className="panel">
      <div
        className="badge"
        style={{ border: `1px solid ${statusColors[device.status]}` }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColors[device.status],
          }}
        />
        {device.status.toUpperCase()}
      </div>
      <h3 style={{ marginTop: 12 }}>{device.name}</h3>
      <p style={{ opacity: 0.7, marginTop: 4 }}>{device.location}</p>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
        Device ID: {device.id}
      </p>
      <div className="detail-metrics">
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
              <td className="detail-metrics-label">Current (A)</td>
              <td className="detail-metrics-value">
                {device.loadCurrentL1 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.loadCurrentL2 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.loadCurrentL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Current THD (%)</td>
              <td className="detail-metrics-value">
                {device.loadCurrentTHDL1 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.loadCurrentTHDL2 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.loadCurrentTHDL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">TPF (%)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.tpf1 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">DPF (%)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.dpf1 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">S (kVA)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.uncompS ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">P (kW)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.uncompP ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Q (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.uncompQ ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">H (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.uncompH ?? "-"}
              </td>
            </tr>
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
              <td className="detail-metrics-label">Current (A)</td>
              <td className="detail-metrics-value">
                {device.gridCurrentL1 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.gridCurrentL2 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.gridCurrentL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Current THD (%)</td>
              <td className="detail-metrics-value">
                {device.gridCurrentTHDL1 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.gridCurrentTHDL2 ?? "-"}
              </td>
              <td className="detail-metrics-value">
                {device.gridCurrentTHDL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">TPF (%)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.tpf2 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">DPF (%)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.dpf2 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">S (kVA)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.compS ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">P (kW)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.compP ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Q (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.compQ ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">H (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {device.compH ?? "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="detail-footer">
        <div className="detail-voltage">
          <span>Voltage</span>
          <strong>
            L1 {device.vL1 ?? "-"} / L2 {device.vL2 ?? "-"} / L3{" "}
            {device.vL3 ?? "-"}
          </strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            Received {new Date(device.lastSeenAt).toLocaleString()}
          </p>
          {device.lastIp && (
            <p style={{ fontSize: 12, opacity: 0.6 }}>IP {device.lastIp}</p>
          )}
        </div>
      </div>
      {device.moduleStatus && device.moduleStatus.length > 0 && (
        <div className="module-status">
          <p className="module-status-title">Module Status</p>
          <div className="module-status-list">
            {device.moduleStatus.map((code, index) => {
              const meta =
                moduleStatusMeta[code] ?? {
                  label: "UNKNOWN",
                  className: "module-chip-unknown",
                };
              return (
                <span
                  key={`module-${index}`}
                  className={`module-chip ${meta.className}`}
                >
                  M{index + 1} {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
};
