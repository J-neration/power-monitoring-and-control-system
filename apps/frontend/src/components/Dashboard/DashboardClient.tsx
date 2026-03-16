"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Site } from "../../types/site";
import type { DeviceStatus } from "../../types/site";
import SiteDetailPanel from "./SiteDetailPanel";
import LiveClock from "./LiveClock";
import KoreaMap from "./KoreaMap";

// ── Helpers ──────────────────────────────────────────────────────────────────
const statusPriority: Record<DeviceStatus, number> = {
  fault: 4,
  offline: 3,
  start: 2,
  standby: 2,
  running: 1,
};

function deriveSiteStatus(site: Site): DeviceStatus {
  let worst: DeviceStatus = "running";
  for (const inst of site.installations) {
    const s = inst.device?.status ?? "offline";
    if (statusPriority[s] > statusPriority[worst]) worst = s;
  }
  return worst;
}

const STATUS_LABEL: Record<DeviceStatus, string> = {
  running: "RUNNING",
  standby: "STANDBY",
  start: "START",
  fault: "FAULT",
  offline: "OFFLINE",
};

// ── Sub-components ───────────────────────────────────────────────────────────
function KpiBadge({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "default" | DeviceStatus;
}) {
  return (
    <div className={`kpi-badge kpi-${variant}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function DashboardClient({ sites }: { sites: Site[] }) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    sites[0]?.id ?? ""
  );

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;

  // First site per region (for map markers)
  const regionToSite = useMemo(() => {
    const map: Record<string, Site> = {};
    for (const site of sites) {
      if (!map[site.region]) map[site.region] = site;
    }
    return map;
  }, [sites]);

  // KPI counts (per installation — matches individual map markers)
  const kpis = useMemo(() => {
    let total = 0, running = 0, fault = 0, standby = 0, offline = 0;
    for (const site of sites) {
      for (const inst of site.installations) {
        total++;
        const s = inst.device?.status ?? "offline";
        if (s === "running") running++;
        else if (s === "fault") fault++;
        else if (s === "standby" || s === "start") standby++;
        else offline++;
      }
    }
    return { total, running, fault, standby, offline };
  }, [sites]);

  return (
    <div className="new-dashboard">
      {/* ── Header ── */}
      <header className="dash-header">
        <div className="dash-logo">
          <span className="dash-logo-mark">▣</span>
          <span className="dash-logo-text">PMCS</span>
        </div>

        <div className="dash-kpis">
          <KpiBadge label="장비 전체" value={kpis.total} variant="default" />
          <KpiBadge label="정상" value={kpis.running} variant="running" />
          <KpiBadge label="대기" value={kpis.standby} variant="standby" />
          <KpiBadge label="이상" value={kpis.fault} variant="fault" />
          <KpiBadge label="오프라인" value={kpis.offline} variant="offline" />
        </div>

        <LiveClock />
      </header>

      {/* ── Body: 3-column ── */}
      <div className="dash-body">
        {/* Left: site list */}
        <aside className="dash-sidebar">
          <p className="sidebar-title">설치 현장</p>
          <div className="sidebar-list">
            {sites.map((site) => {
              const status = deriveSiteStatus(site);
              const isSelected = site.id === selectedSiteId;
              return (
                <button
                  key={site.id}
                  type="button"
                  className={`site-card${isSelected ? " selected" : ""}`}
                  onClick={() => setSelectedSiteId(site.id)}
                >
                  <div className={`site-card-dot ${status}`} />
                  <div className="site-card-info">
                    <strong className="site-card-name">{site.name}</strong>
                    <span className="site-card-region">{site.region}</span>
                  </div>
                  <span className={`site-card-badge ${status}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="sidebar-footer">
            <Link href="/" className="sidebar-link">
              전체 사이트 보기 →
            </Link>
          </div>
        </aside>

        {/* Center: map */}
        <div className="dash-map-panel">
          <KoreaMap
            regionToSite={regionToSite}
            allSites={sites}
            selectedSiteId={selectedSiteId}
            deriveSiteStatus={deriveSiteStatus}
            onSelect={setSelectedSiteId}
          />
        </div>

        {/* Right: detail panel */}
        <SiteDetailPanel site={selectedSite} />
      </div>
    </div>
  );
}
