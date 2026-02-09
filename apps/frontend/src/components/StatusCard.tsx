import { Device } from "../types/device";

type StatusCardProps = {
  device: Device;
};

const statusColors: Record<Device["status"], string> = {
  online: "#2ecc71",
  offline: "#e74c3c",
  warning: "#f1c40f",
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
      <div className="metrics-split">
        <table className="metrics-table">
          <thead>
            <tr>
              <th className="metrics-cell metrics-title" colSpan={4}>
                <span className="metrics-chip metrics-chip-grid">Grid</span>
              </th>
            </tr>
            <tr>
              <th className="metrics-cell metrics-label" />
              <th className="metrics-cell metrics-value">L1</th>
              <th className="metrics-cell metrics-value">L2</th>
              <th className="metrics-cell metrics-value">L3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="metrics-cell metrics-label">Current</td>
              <td className="metrics-cell metrics-value">
                {device.gridCurrentL1 ?? "-"}
              </td>
              <td className="metrics-cell metrics-value">
                {device.gridCurrentL2 ?? "-"}
              </td>
              <td className="metrics-cell metrics-value">
                {device.gridCurrentL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="metrics-cell metrics-label">Current THD</td>
              <td className="metrics-cell metrics-value">
                {device.gridCurrentTHDL1 ?? "-"}
              </td>
              <td className="metrics-cell metrics-value">
                {device.gridCurrentTHDL2 ?? "-"}
              </td>
              <td className="metrics-cell metrics-value">
                {device.gridCurrentTHDL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="metrics-cell metrics-label">TPF</td>
              <td className="metrics-cell metrics-value" colSpan={3}>
                {device.tpf2 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="metrics-cell metrics-label">DPF</td>
              <td className="metrics-cell metrics-value" colSpan={3}>
                {device.dpf2 ?? "-"}
              </td>
            </tr>
          </tbody>
        </table>
        <table className="metrics-table">
          <thead>
            <tr>
              <th className="metrics-cell metrics-title" colSpan={4}>
                <span className="metrics-chip metrics-chip-load">Load</span>
              </th>
            </tr>
            <tr>
              <th className="metrics-cell metrics-label" />
              <th className="metrics-cell metrics-value">L1</th>
              <th className="metrics-cell metrics-value">L2</th>
              <th className="metrics-cell metrics-value">L3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="metrics-cell metrics-label">Current</td>
              <td className="metrics-cell metrics-value">
                {device.loadCurrentL1 ?? "-"}
              </td>
              <td className="metrics-cell metrics-value">
                {device.loadCurrentL2 ?? "-"}
              </td>
              <td className="metrics-cell metrics-value">
                {device.loadCurrentL3 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="metrics-cell metrics-label">TPF</td>
              <td className="metrics-cell metrics-value" colSpan={3}>
                {device.tpf1 ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="metrics-cell metrics-label">DPF</td>
              <td className="metrics-cell metrics-value" colSpan={3}>
                {device.dpf1 ?? "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 12, opacity: 0.6 }}>
          Received {new Date(device.lastSeenAt).toLocaleString()}
        </p>
        {device.lastIp && (
          <p style={{ fontSize: 12, opacity: 0.6 }}>IP {device.lastIp}</p>
        )}
      </div>
    </article>
  );
};
