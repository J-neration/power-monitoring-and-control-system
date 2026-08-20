"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Site } from "../../types/site";
import type { DeviceStatus } from "../../types/site";
import { CLIENT_LABELS } from "../../data/clients";
import SiteSummaryPanel from "./SiteSummaryPanel";
// 지도는 react-simple-maps 의 마커 transform 이 서버/클라이언트에서 부동소수점
// 끝자리까지 달라져 hydration 경고가 발생하므로 클라이언트 전용으로 렌더한다.
const KoreaMap = dynamic(() => import("./KoreaMap"), {
  ssr: false,
  loading: () => <div className="korea-map-loading" aria-hidden />,
});
import LteRadarOverlay from "./LteRadarOverlay";
import LteSignalIndicator from "../LteSignalIndicator";
import AlarmTicker from "./AlarmTicker";
import AlarmPanel from "./AlarmPanel";
import ControlRoomToolbar from "./ControlRoomToolbar";
import EventLogPanel from "./EventLogPanel";
import { useWsEvents } from "../../hooks/useWsEvents";
import { useAlarmAck } from "../../hooks/useAlarmAck";
import { useControlRoomMode } from "../../hooks/useControlRoomMode";
import { useEventLog } from "../../hooks/useEventLog";
import { buildAlarms } from "../../lib/alarms";
import { siteMatchesSearch } from "../../lib/siteSearch";
import {
  compareKoNumeric,
  deriveSiteStatus,
  installationMatchesFilter,
  siteMatchesFilter,
  sortSitesByName,
  sortByLabel,
  STATUS_LABEL,
  type StatusFilter,
} from "../../lib/deviceStatus";

const REFRESH_SEC = 30;

const FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "fault", label: "이상" },
  { id: "offline", label: "오프라인" },
];

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
  const [selectedInstallationId, setSelectedInstallationId] = useState<
    string | null
  >(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [openRegion, setOpenRegion] = useState<string | null>(
    sites[0]?.region ?? null,
  );
  const [scrollToRegion, setScrollToRegion] = useState<string | null>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const regionElRefs = useRef(new Map<string, HTMLElement>());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const countdownRef = useRef(REFRESH_SEC);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const scrollRegionIntoView = useCallback((region: string) => {
    const list = sidebarListRef.current;
    const el = regionElRefs.current.get(region);
    if (!list || !el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top - listRect.top - 8;
    if (Math.abs(delta) < 2) return;
    list.scrollTo({
      top: list.scrollTop + delta,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    if (!scrollToRegion) return;
    const region = scrollToRegion;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollRegionIntoView(region);
        setScrollToRegion(null);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [scrollToRegion, openRegion, scrollRegionIntoView]);

  const handleSelectSite = useCallback(
    (siteId: string, installationId?: string) => {
      setSelectedSiteId(siteId);
      setSelectedInstallationId(installationId ?? null);
      setFocusSeq((n) => n + 1);
      const site = sitesRef.current.find((s) => s.id === siteId);
      if (site?.region) setOpenRegion(site.region);
    },
    [],
  );

  const handleSelectRegion = useCallback((region: string, siteId?: string) => {
    setOpenRegion(region);
    if (siteId) {
      setSelectedSiteId(siteId);
      setSelectedInstallationId(null);
      setFocusSeq((n) => n + 1);
    }
    setScrollToRegion(region);
  }, []);

  const {
    layout,
    setLayout,
    controlRoom,
    autoRotate,
    setAutoRotate,
    toggleControlRoom,
    rotateSec,
  } = useControlRoomMode(sites, selectedSiteId, handleSelectSite);

  const alarms = useMemo(() => buildAlarms(sites), [sites]);
  const {
    unackedCount,
    soundOn,
    ackOne,
    ackAll,
    toggleSound,
    isAcked,
  } = useAlarmAck(alarms);

  const eventLogEntries = useEventLog(sites);

  const triggerRefresh = useCallback(() => {
    countdownRef.current = REFRESH_SEC;
    setCountdown(REFRESH_SEC);
    router.refresh();
  }, [router]);

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

  useWsEvents((msg) => {
    if (msg.type === "device_updated") {
      triggerRefresh();
    }
  });

  useEffect(() => {
    if (layout === "alarm") {
      setStatusFilter("fault");
    }
  }, [layout]);

  useEffect(() => {
    document.body.classList.toggle("pmcs-control-room", controlRoom);
    return () => document.body.classList.remove("pmcs-control-room");
  }, [controlRoom]);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const regionGroups = useMemo(() => {
    const map = new Map<string, Site[]>();
    for (const site of sites) {
      if (!siteMatchesFilter(site, statusFilter)) continue;
      if (!siteMatchesSearch(site, searchQuery)) continue;
      const arr = map.get(site.region) ?? [];
      arr.push(site);
      map.set(site.region, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => compareKoNumeric(a, b))
      .map(([region, regionSites]) => [
        region,
        sortSitesByName(regionSites),
      ] as const);
  }, [sites, statusFilter, searchQuery]);

  const visibleSiteCount = useMemo(
    () =>
      regionGroups.reduce((sum, [, regionSites]) => sum + regionSites.length, 0),
    [regionGroups],
  );

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

  const dashClass = [
    "new-dashboard",
    controlRoom ? "dashboard-control-room" : "",
    `dashboard-layout-${layout}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={dashClass}>
      <div className="dash-kpi-strip">
        <LiveIndicator countdown={countdown} />
        <div className="kpi-divider" />
        <KpiBadge label="장비 전체" value={kpis.total} variant="default" />
        <KpiBadge label="가동" value={kpis.running} variant="running" />
        <KpiBadge label="대기" value={kpis.standby} variant="standby" />
        <KpiBadge
          label="이상"
          value={kpis.fault}
          variant="fault"
          urgent={kpis.fault > 0}
        />
        <KpiBadge label="오프라인" value={kpis.offline} variant="offline" />
        <div className="kpi-strip-spacer" />
        <ControlRoomToolbar
          layout={layout}
          onLayoutChange={setLayout}
          controlRoom={controlRoom}
          onToggleControlRoom={toggleControlRoom}
          autoRotate={autoRotate}
          onToggleAutoRotate={() => setAutoRotate((v) => !v)}
          rotateSec={rotateSec}
        />
      </div>

      {layout !== "alarm" && (
        <AlarmTicker
          sites={sites}
          unackedCount={unackedCount}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          onAckAll={ackAll}
        />
      )}

      {layout !== "alarm" && <EventLogPanel entries={eventLogEntries} />}

      <div className="dash-body">
        {layout === "alarm" ? (
          <>
            <div className="dash-alarm-column">
              <AlarmPanel
                alarms={alarms}
                unackedCount={unackedCount}
                isAcked={isAcked}
                onAck={ackOne}
                onAckAll={ackAll}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                onSelectSite={handleSelectSite}
                selectedSiteId={selectedSiteId}
              />
            </div>
            <SiteSummaryPanel
              site={selectedSite}
              showSparklines
              selectedInstallationId={selectedInstallationId}
              focusSeq={focusSeq}
            />
          </>
        ) : (
          <>
            <aside className="dash-sidebar">
              <div className="sidebar-head">
                <div className="sidebar-title-row">
                  <p className="sidebar-title">설치 현황</p>
                  <span className="sidebar-title-count">
                    {visibleSiteCount === sites.length
                      ? `총 ${sites.length}개 현장`
                      : `${visibleSiteCount}/${sites.length}개 현장`}
                  </span>
                </div>
                <div className="sidebar-search-wrap">
                  <input
                    type="search"
                    className="sidebar-search"
                    placeholder="현장·건설사·지역 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="현장 검색"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="sidebar-search-clear"
                      onClick={() => setSearchQuery("")}
                      aria-label="검색 지우기"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div
                  className="sidebar-filters"
                  role="group"
                  aria-label="상태 필터"
                >
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`sidebar-filter-chip${statusFilter === opt.id ? " active" : ""}${opt.id === "fault" ? " sidebar-filter-chip--fault" : ""}${opt.id === "offline" ? " sidebar-filter-chip--offline" : ""}`}
                      onClick={() => setStatusFilter(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sidebar-list" ref={sidebarListRef}>
                {regionGroups.length === 0 ? (
                  <p className="sidebar-empty">
                    {searchQuery
                      ? "검색 결과가 없습니다"
                      : "해당 상태의 현장이 없습니다"}
                  </p>
                ) : (
                  regionGroups.map(([region, regionSites]) => {
                    const instCount = regionSites.reduce(
                      (sum, s) =>
                        sum +
                        s.installations.filter((inst) =>
                          installationMatchesFilter(
                            (inst.device?.status as DeviceStatus) ??
                              "offline",
                            statusFilter,
                          ),
                        ).length,
                      0,
                    );
                    const regionOpen =
                      openRegion === region ||
                      statusFilter !== "all" ||
                      !!searchQuery.trim();

                    return (
                      <details
                        key={region}
                        ref={(node) => {
                          if (node) regionElRefs.current.set(region, node);
                          else regionElRefs.current.delete(region);
                        }}
                        className="region-group"
                        open={regionOpen}
                        onToggle={(e) => {
                          if (statusFilter !== "all" || searchQuery.trim())
                            return;
                          const nextOpen = (e.currentTarget as HTMLDetailsElement)
                            .open;
                          if (nextOpen) setOpenRegion(region);
                          else if (openRegion === region) setOpenRegion(null);
                        }}
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
                            const visibleInstallations = sortByLabel(
                              site.installations.filter((inst) =>
                                installationMatchesFilter(
                                  (inst.device?.status as DeviceStatus) ??
                                    "offline",
                                  statusFilter,
                                ),
                              ),
                            );

                            if (visibleInstallations.length === 0) return null;

                            return (
                              <details
                                key={site.id}
                                className={`site-group site-group--${siteStatus}`}
                                open={isSiteSelected}
                              >
                                <summary
                                  className={`site-group-summary${isSiteSelected ? " selected" : ""}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleSelectSite(site.id);
                                  }}
                                >
                                  <div
                                    className={`site-group-dot ${siteStatus}`}
                                  />
                                  <div className="site-group-info">
                                    <strong className="site-group-name">
                                      {site.name}
                                    </strong>
                                    <span className="site-group-client">
                                      {CLIENT_LABELS[site.client] ?? site.client}
                                    </span>
                                  </div>
                                  <span
                                    className={`site-card-badge ${siteStatus}`}
                                  >
                                    {STATUS_LABEL[siteStatus]}
                                  </span>
                                  {isSiteSelected && (
                                    <span className="site-group-selected-tag">
                                      선택
                                    </span>
                                  )}
                                </summary>

                                <div className="site-group-installations">
                                  {visibleInstallations.map((inst) => {
                                    const instStatus =
                                      (inst.device?.status as DeviceStatus) ??
                                      "offline";

                                    return (
                                      <button
                                        key={inst.id}
                                        type="button"
                                        className={`inst-card inst-card--${instStatus}${selectedInstallationId === inst.id ? " selected" : ""}`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleSelectSite(site.id, inst.id);
                                        }}
                                      >
                                        <div
                                          className={`inst-card-dot ${instStatus}`}
                                        />
                                        <div className="inst-card-info">
                                          <span className="inst-card-label">
                                            {inst.label}
                                          </span>
                                        </div>
                                        <LteSignalIndicator
                                          device={inst.device}
                                          variant="compact"
                                        />
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
                  })
                )}
              </div>
            </aside>

            <div className="dash-map-panel">
              <div className="dash-map-mobile-header">
                <span className="dash-map-mobile-label">지도</span>
                {selectedSite && (
                  <span className="dash-map-mobile-site">{selectedSite.name}</span>
                )}
              </div>
              <KoreaMap
                allSites={sites}
                selectedSiteId={selectedSite?.id ?? ""}
                deriveSiteStatus={deriveSiteStatus}
                onSelect={handleSelectSite}
                onSelectRegion={handleSelectRegion}
              />
              <LteRadarOverlay />
            </div>

            <SiteSummaryPanel
              site={selectedSite}
              showSparklines
              selectedInstallationId={selectedInstallationId}
              focusSeq={focusSeq}
            />
          </>
        )}
      </div>
    </div>
  );
}
