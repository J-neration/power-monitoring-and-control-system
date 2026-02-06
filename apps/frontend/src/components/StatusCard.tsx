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
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>V L1</p>
          <strong>{device.vL1 ?? "-"}</strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>V L2</p>
          <strong>{device.vL2 ?? "-"}</strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>V L3</p>
          <strong>{device.vL3 ?? "-"}</strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>I L1</p>
          <strong>{device.iL1 ?? "-"}</strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>I L2</p>
          <strong>{device.iL2 ?? "-"}</strong>
        </div>
        <div>
          <p style={{ fontSize: 12, opacity: 0.6 }}>I L3</p>
          <strong>{device.iL3 ?? "-"}</strong>
        </div>
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
