"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Site } from "../../types/site";
import type { DeviceStatus } from "../../types/site";
import { CLIENT_LABELS } from "../../data/clients";
import SiteSummaryPanel from "./SiteSummaryPanel";
import KoreaMap from "./KoreaMap";
import { useWsEvents } from "../../hooks/useWsEvents";

const REFRESH_SEC = 30;

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

function KpiBadge({
  label,
  value,
  variant,
  urgent,
}: {
  label: string;
  value: number;
  variant: "default" | DeviceStatus;
  urgent?: boolean;
}) {
  return (
    <div className={`kpi-badge kpi-${variant}${urgent ? " kpi-urgent" : ""}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

function LiveIndicator({ countdown }: { countdown: number }) {
  const pct = (countdown / REFRESH_SEC) * 100;
  const r = 7;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="live-indicator">
      <span className="live-dot" />
      <span className="live-label">LIVE</span>
      <svg className="live-ring" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r={r} className="live-ring-track" />
        <circle
          cx="11"
          cy="11"
          r={r}
          className="live-ring-fill"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
        />
      </svg>
      <span className="live-countdown">{countdown}s</span>
    </div>
  );
}

export default function DashboardClient({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    sites[0]?.id ?? "",
  );
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const countdownRef = useRef(REFRESH_SEC);

  const triggerRefresh = useCallback(() => {
    countdownRef.current = REFRESH_SEC;
    setCountdown(REFRESH_SEC);
    router.refresh();
  }, [router]);

  // Periodic fallback refresh (30 s)
  useEffect(() => {
    countdownRef.current = REFRESH_SEC;
    setCountdown(REFRESH_SEC);
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        triggerRefresh();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [triggerRefresh]);

  // Immediate refresh on WebSocket push
  useWsEvents((msg) => {
    if (msg.type === "device_updated") {
      triggerRefresh();
    }
  });

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const regionGroups = useMemo(() => {
    const map = new Map<string, Site[]>();
    for (const site of sites) {
      const arr = map.get(site.region) ?? [];
      arr.push(site);
      map.set(site.region, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "ko"),
    );
  }, [sites]);

  const kpis = useMemo(() => {
    let total = 0,
      running = 0,
      fault = 0,
      standby = 0,
      offline = 0;
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

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
  };

  return (
    <div className="new-dashboard">
      {/* KPI strip */}
      <div className="dash-kpi-strip">
        <LiveIndicator countdown={countdown} />
        <div className="kpi-divider" />
        <KpiBadge label="장비 전체" value={kpis.total} variant="default" />
        <KpiBadge label="정상" value={kpis.running} variant="running" />
        <KpiBadge label="대기" value={kpis.standby} variant="standby" />
        <KpiBadge
          label="이상"
          value={kpis.fault}
          variant="fault"
          urgent={kpis.fault > 0}
        />
        <KpiBadge label="오프라인" value={kpis.offline} variant="offline" />
      </div>

      {/* Body: 3-column */}
      <div className="dash-body">
        {/* Left: region > site > installation accordion */}
        <aside className="dash-sidebar">
          <p className="sidebar-title">설치 현황</p>
          <div className="sidebar-list">
            {regionGroups.map(([region, regionSites]) => {
              const instCount = regionSites.reduce(
                (sum, s) => sum + s.installations.length,
                0,
              );
              const hasSelected = regionSites.some(
                (s) => s.id === selectedSiteId,
              );

              return (
                <details
                  key={region}
                  className="region-group"
                  open={hasSelected}
                >
                  <summary className="region-group-summary">
                    <span className="region-group-name">{region}</span>
                    <span className="region-group-count">
                      {regionSites.length}현장 · {instCount}대
                    </span>
                    <span className="region-chevron">▾</span>
                  </summary>

                  <div className="region-group-content">
                    {regionSites.map((site) => {
                      const siteStatus = deriveSiteStatus(site);
                      const isSiteSelected = site.id === selectedSiteId;

                      return (
                        <details
                          key={site.id}
                          className="site-group"
                          open={isSiteSelected}
                        >
                          <summary
                            className="site-group-summary"
                            onClick={(e) => {
                              e.preventDefault();
                              handleSelectSite(site.id);
                            }}
                          >
                            <div className={`site-group-dot ${siteStatus}`} />
                            <div className="site-group-info">
                              <strong className="site-group-name">
                                {site.name}
                              </strong>
                              <span className="site-group-client">
                                {CLIENT_LABELS[site.client] ?? site.client}
                              </span>
                            </div>
                            <span className={`site-card-badge ${siteStatus}`}>
                              {STATUS_LABEL[siteStatus]}
                            </span>
                          </summary>

                          <div className="site-group-installations">
                            {site.installations.map((inst) => {
                              const instStatus =
                                (inst.device?.status as DeviceStatus) ??
                                "offline";

                              return (
                                <button
                                  key={inst.id}
                                  type="button"
                                  className="inst-card"
                                  onClick={() => handleSelectSite(site.id)}
                                >
                                  <div
                                    className={`inst-card-dot ${instStatus}`}
                                  />
                                  <div className="inst-card-info">
                                    <span className="inst-card-label">
                                      {inst.label}
                                    </span>
                                  </div>
                                  <span
                                    className={`site-card-badge ${instStatus}`}
                                  >
                                    {STATUS_LABEL[instStatus]}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </aside>

        {/* Center: map */}
        <div className="dash-map-panel">
          <div className="map-scan-overlay" />
          <KoreaMap
            allSites={sites}
            selectedSiteId={selectedSite?.id ?? ""}
            deriveSiteStatus={deriveSiteStatus}
            onSelect={handleSelectSite}
          />
        </div>

        {/* Right: site summary panel */}
        <SiteSummaryPanel site={selectedSite} />
      </div>
    </div>
  );
}
