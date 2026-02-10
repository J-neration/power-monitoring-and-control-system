import Link from "next/link";
import { fetchDevices } from "../../../lib/api";
import { DeviceSummaryCard } from "../../../components/DeviceSummaryCard";
import { Device } from "../../../types/device";

type RegionPageProps = {
  params: { region: string };
};

const toInt = (value?: number | string) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const summarizeStatus = (devices: Device[]) => {
  return devices.reduce(
    (acc, device) => {
      const totalMods =
        toInt(device.numOfMods) ??
        (device.moduleStatus ? device.moduleStatus.length : 0);
      const list = device.moduleStatus ?? [];
      const running = list.filter((code) => code === 2).length;
      const fault = list.filter((code) => code === 3).length;
      const check = list.filter((code) => code !== 2 && code !== 3).length;
      const missing = Math.max(0, totalMods - list.length);

      acc.total += totalMods;
      acc.ok += running;
      acc.fault += fault;
      acc.check += check + missing;
      return acc;
    },
    { total: 0, ok: 0, check: 0, fault: 0 },
  );
};

const formatUpdated = (devices: Device[]) => {
  const latest = devices
    .map((device) => Date.parse(device.lastSeenAt))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => (value > max ? value : max), 0);
  if (!latest) {
    return "-";
  }
  return new Date(latest).toLocaleString();
};

export default async function RegionPage({ params }: RegionPageProps) {
  const devices = await fetchDevices();
  const regionName = decodeURIComponent(params.region);
  const regionDevices = devices.filter((device) =>
    (device.location ?? "").includes(regionName),
  );
  const summary = summarizeStatus(regionDevices);
  const locations = regionDevices.reduce<Record<string, Device[]>>(
    (acc, device) => {
      const key = device.location || "Unknown";
      acc[key] = acc[key] ? [...acc[key], device] : [device];
      return acc;
    },
    {},
  );

  return (
    <main>
      <section className="panel detail-header">
        <div className="region-header">
          <Link className="detail-back" href="/">
            ← 대시보드
          </Link>
          <h1>{regionName}</h1>
          <p className="detail-subtitle">
            합계 {summary.total} · 정상 {summary.ok} · 점검 {summary.check} · 고장{" "}
            {summary.fault}
          </p>
          <p className="detail-subtitle">
            마지막 업데이트: {formatUpdated(regionDevices)}
          </p>
        </div>
      </section>
      <section className="dashboard">
        {Object.entries(locations).map(([location, locationDevices]) => (
          <div key={location} className="panel location-panel">
            <div className="location-header">
              <div className="location-meta">
                <div className="location-title">
                  <h2>{location}</h2>
                </div>
                <p className="location-subtitle">
                  모듈 {summarizeStatus(locationDevices).total}개
                </p>
              </div>
            </div>
            <div className="location-divider" />
            <div className="device-grid">
              {locationDevices.map((device) => (
                <DeviceSummaryCard key={device.id} device={device} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
