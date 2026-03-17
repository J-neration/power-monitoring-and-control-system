import type { DeviceStatus, DeviceWithInstallation } from "../types/site";

type StatusCardProps = {
  device: DeviceWithInstallation;
};

const statusColors: Record<DeviceStatus, string> = {
  standby: "#9aa4b2",
  start: "#ffcc00",
  running: "#2ecc71",
  fault: "#f24141",
  offline: "#6b7280",
};

const moduleStatusMeta: Record<number, { label: string; className: string }> = {
  0: { label: "STANDBY", className: "module-chip-standby" },
  1: { label: "START", className: "module-chip-start" },
  2: { label: "RUNNING", className: "module-chip-running" },
  3: { label: "FAULT", className: "module-chip-fault" },
  4: { label: "OFFLINE", className: "module-chip-offline" },
};

const fmt = (v: unknown, digits = 2) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(digits) : "-";
  const s = String(v).trim();
  return s.length ? s : "-";
};

export const StatusCard = ({ device }: StatusCardProps) => {
  const site = device.installation?.site;
  const title = `${site?.name ?? "Site"} / ${device.installation?.label ?? "Installation"}`;
  const location = `${site?.region ?? ""} ${site?.address ?? ""}`.trim();

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

      {/* 기존 device.name -> site.name + installation.label */}
      <h3 style={{ marginTop: 12 }}>{title}</h3>

      {/* 기존 device.location -> site.region + site.address */}
      <p style={{ opacity: 0.7, marginTop: 4 }}>{location || "-"}</p>

      {/* 기존 device.id -> installationId */}
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
        Installation ID: {device.installationId}
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
              <td className="detail-metrics-value">{fmt(device.loadCurrentL1, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.loadCurrentL2, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.loadCurrentL3, 1)}</td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Current THD (%)</td>
              <td className="detail-metrics-value">{fmt(device.loadCurrentTHDL1, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.loadCurrentTHDL2, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.loadCurrentTHDL3, 1)}</td>
            </tr>
            <tr>
              <td className="detail-metrics-label">TPF (%)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.tpf1, 3)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">DPF (%)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.dpf1, 3)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">S (kVA)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.uncompS, 2)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">P (kW)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.uncompP, 2)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Q (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.uncompQ, 2)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">H (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.uncompH, 2)}
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
              <td className="detail-metrics-value">{fmt(device.gridCurrentL1, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.gridCurrentL2, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.gridCurrentL3, 1)}</td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Current THD (%)</td>
              <td className="detail-metrics-value">{fmt(device.gridCurrentTHDL1, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.gridCurrentTHDL2, 1)}</td>
              <td className="detail-metrics-value">{fmt(device.gridCurrentTHDL3, 1)}</td>
            </tr>
            <tr>
              <td className="detail-metrics-label">TPF (Grid)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.tpf2, 3)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">DPF (Grid)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.dpf2, 3)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">S (kVA)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.compS, 2)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">P (kW)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.compP, 2)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">Q (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.compQ, 2)}
              </td>
            </tr>
            <tr>
              <td className="detail-metrics-label">H (kvar)</td>
              <td className="detail-metrics-value" colSpan={3}>
                {fmt(device.compH, 2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="detail-footer">
        <div className="detail-voltage">
          <span>Voltage</span>
          <strong>
            L1 {fmt(device.vL1, 1)} / L2 {fmt(device.vL2, 1)} / L3 {fmt(device.vL3, 1)}
          </strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            Received {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "-"}
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
