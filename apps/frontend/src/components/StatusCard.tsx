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
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>Inputs</p>
          <strong>{device.inputs}</strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>Outputs</p>
          <strong>{device.outputs}</strong>
        </div>
      </div>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>
        Last seen {new Date(device.lastSeenAt).toLocaleString()}
      </p>
    </article>
  );
};
