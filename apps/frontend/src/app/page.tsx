import { fetchDevices } from "../lib/api";
import { DeviceSummaryCard } from "../components/DeviceSummaryCard";
import { Device } from "../types/device";

const toTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatUpdated = (devices: Device[]) => {
  const latest = devices
    .map((device) => toTimestamp(device.lastSeenAt))
    .reduce((max, value) => (value > max ? value : max), 0);
  if (!latest) {
    return "-";
  }
  return new Date(latest).toLocaleString();
};

const summarizeStatus = (devices: Device[]) => {
  return devices.reduce(
    (acc, device) => {
      acc.total += 1;
      if (device.status === "running") {
        acc.ok += 1;
      } else if (device.status === "fault") {
        acc.fault += 1;
      } else {
        acc.check += 1;
      }
      return acc;
    },
    { total: 0, ok: 0, check: 0, fault: 0 },
  );
};

const statusDotColor = (summary: ReturnType<typeof summarizeStatus>) => {
  if (summary.fault > 0) {
    return "#e74c3c";
  }
  if (summary.check > 0) {
    return "#f1c40f";
  }
  return "#2ecc71";
};

export default async function HomePage() {
  const devices = await fetchDevices();
  const locations = devices.reduce<Record<string, typeof devices>>(
    (acc, device) => {
      const key = device.location || "Unknown";
      acc[key] = acc[key] ? [...acc[key], device] : [device];
      return acc;
    },
    {},
  );

  return (
    <main>
      <section className="dashboard">
        {Object.entries(locations).map(([location, locationDevices]) => (
          <div key={location} className="panel location-panel">
            {(() => {
              const summary = summarizeStatus(locationDevices);
              const representative = locationDevices[0];
              return (
                <>
                  <div className="location-header">
                    <div className="location-meta">
                      <div className="location-title">
                        <span
                          className="location-dot"
                          style={{ background: statusDotColor(summary) }}
                        />
                        <h2>{location}</h2>
                      </div>
                      <p className="location-subtitle">
                        대표 장치: {representative?.id ?? "-"}
                      </p>
                      <p className="location-subtitle">
                        마지막 업데이트: {formatUpdated(locationDevices)}
                      </p>
                    </div>
                    <div className="summary-cards">
                      <div className="summary-card">
                        <span>합계</span>
                        <strong>{summary.total}</strong>
                      </div>
                      <div className="summary-card summary-card-ok">
                        <span>정상</span>
                        <strong>{summary.ok}</strong>
                      </div>
                      <div className="summary-card summary-card-check">
                        <span>점검 필요</span>
                        <strong>{summary.check}</strong>
                      </div>
                      <div className="summary-card summary-card-fault">
                        <span>고장</span>
                        <strong>{summary.fault}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="location-divider" />
                  <div className="device-grid">
                    {locationDevices.map((device) => (
                      <DeviceSummaryCard key={device.id} device={device} />
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        ))}
      </section>
    </main>
  );
}
