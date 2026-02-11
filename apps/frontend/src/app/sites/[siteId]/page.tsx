import Link from "next/link";
import { fetchSites } from "../../../lib/api";
import type { DeviceStatus } from "../../../types/site";
import InstallationSummaryCard from "../../../components/InstallationSummary/InstallationSummaryCard";
import InstallationTopBar from "../../../components/InstallationSummary/InstallationTopBar";


type Props = {
  params: { siteId: string };
};

const statusPriority: Record<DeviceStatus, number> = {  // 상태 우선순위
  fault: 4,
  offline: 3,
  start: 2,
  standby: 2,
  running: 1,
};

const summarizeSite = (installations: { device: { status: DeviceStatus; moduleStatus?: number[]; numOfMods?: number | string } }[]) => {
  return installations.reduce(
    (acc, inst) => {
      const d = inst.device;
      const list = d.moduleStatus ?? [];
      const totalMods =
        typeof d.numOfMods === "number"
          ? d.numOfMods
          : Number.isFinite(Number.parseInt(String(d.numOfMods ?? ""), 10))
            ? Number.parseInt(String(d.numOfMods), 10)
            : list.length;

      const running = list.filter((code) => code === 2).length;
      const fault = list.filter((code) => code === 3).length;
      const check = list.filter((code) => code !== 2 && code !== 3).length;
      const missing = Math.max(0, totalMods - list.length);

      acc.total += totalMods;
      acc.ok += running;
      acc.fault += fault;
      acc.check += check + missing;

      // site worst status
      const s = d.status ?? "offline";
      if (statusPriority[s] > statusPriority[acc.status]) {
        acc.status = s;
      }

      return acc;
    },
    { total: 0, ok: 0, check: 0, fault: 0, status: "running" as DeviceStatus },
  );
};

const formatUpdated = (installations: { device: { lastSeenAt: string } }[]) => {
  const latest = installations
    .map((x) => Date.parse(x.device.lastSeenAt))
    .filter((v) => Number.isFinite(v))
    .reduce((max, v) => (v > max ? v : max), 0);

  if (!latest) return "-";
  return new Date(latest).toLocaleString();
};

export default async function SitePage({ params }: Props) {
  const sites = await fetchSites();
  const siteId = decodeURIComponent(params.siteId);
  const site = sites.find((s) => s.id === siteId);

  if (!site) {
    return (
      <main>
        <section className="panel detail-header">
          <div className="region-header">
            <Link className="detail-back" href="/">
              ← 대시보드
            </Link>
            <h1>Site not found</h1>
            <p className="detail-subtitle">{siteId}</p>
          </div>
        </section>
      </main>
    );
  }

  const summary = summarizeSite(site.installations);

  return (
    <main>
     <InstallationTopBar
     name={site.name}
     address={site.address}
     lastUpdatedText={formatUpdated(site.installations)}
     status={summary.status}
     summary={summary}
     />
      <section className="dashboard">
        <div className="panel location-panel">
          <div className="device-grid">
            {site.installations.map((inst) => (
                <InstallationSummaryCard
                key={inst.id}
                installationId={inst.id}
                label={inst.label}
                device={inst.device}
                />
            ))}
            </div>
        </div>
      </section>
    </main>
  );
}
