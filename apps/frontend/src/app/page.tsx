import { fetchDevices } from "../lib/api";
import { StatusCard } from "../components/StatusCard";

export default async function HomePage() {
  const devices = await fetchDevices();

  return (
    <main>
      <section className="panel">
        <h1>HMI Monitoring & Control</h1>
        <p style={{ opacity: 0.75, marginTop: 8 }}>
          Live view of HMI endpoints, signal routing, and device health.
        </p>
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>Device Status</h2>
        <div className="grid">
          {devices.map((device) => (
            <StatusCard key={device.id} device={device} />
          ))}
        </div>
      </section>
    </main>
  );
}
