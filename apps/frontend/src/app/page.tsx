import { fetchDevices } from "../lib/api";
import { StatusCard } from "../components/StatusCard";

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
      <section className="panel">
        <h1>HMI Monitoring & Control</h1>
        <p style={{ opacity: 0.75, marginTop: 8 }}>
          Live view of HMI endpoints, signal routing, and device health.
        </p>
      </section>

      <section className="dashboard">
        {Object.entries(locations).map(([location, locationDevices]) => (
          <div key={location} className="panel location-panel">
            {(() => {
              const counts = locationDevices.reduce(
                (acc, device) => {
                  acc[device.status] += 1;
                  return acc;
                },
                { online: 0, warning: 0, offline: 0 },
              );
              return (
                <>
                  <div className="location-header">
                    <div>
                      <h2>{location}</h2>
                      <p className="location-subtitle">
                        {locationDevices.length} device
                        {locationDevices.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="location-badges">
                      <span className="badge">ONLINE {counts.online}</span>
                      <span className="badge">WARNING {counts.warning}</span>
                      <span className="badge">OFFLINE {counts.offline}</span>
                    </div>
                  </div>
                  <div className="grid">
                    {locationDevices.map((device) => (
                      <StatusCard key={device.id} device={device} />
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
