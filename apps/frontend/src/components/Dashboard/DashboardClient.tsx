"use client";

import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
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
import CommLostBadge from "../CommLostBadge";
import AlarmTicker from "./AlarmTicker";
import AlarmPanel from "./AlarmPanel";
import ControlRoomToolbar from "./ControlRoomToolbar";
import EventLogPanel from "./EventLogPanel";
import { useWsEvents } from "../../hooks/useWsEvents";
import { bindPageRefresh, schedulePageRefresh } from "../../lib/pageRefresh";
import { useAlarmAck } from "../../hooks/useAlarmAck";
import { useControlRoomMode } from "../../hooks/useControlRoomMode";
import { useEventLog } from "../../hooks/useEventLog";
import { buildAlarms } from "../../lib/alarms";
import { formatIccidListName } from "../../lib/iccidLabel";
import { siteMatchesSearch } from "../../lib/siteSearch";
import {
  compareKoNumeric,
  deriveSiteStatus,
  installationMatchesFilter,
  siteMatchesFilter,
  siteHasCommLost,
  sortSitesByName,
  sortByLabel,
  STATUS_LABEL,
  type StatusFilter,
} from "../../lib/deviceStatus";
import { isCommLost } from "../../lib/commStatus";

const REFRESH_SEC = 30;

type MobilePane = "list" | "map" | "detail";

const FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "standby", label: "대기" },
  { id: "fault", label: "이상" },
  { id: "offline", label: "오프라인" },
  { id: "comm_lost", label: "통신 끊김" },
];

function KpiBadge({
  label,
  value,
  variant,
  urgent,
}: {
  label: string;
  value: number;
  variant: "default" | DeviceStatus | "comm_lost";
  urgent?: boolean;
}) {
  return (
    <div className={`kpi-badge kpi-${variant}${urgent ? " kpi-urgent" : ""}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

function LiveIndicator({
  refreshSec,
  refreshEpoch,
}: {
  refreshSec: number;
  refreshEpoch: number;
}) {
  const [countdown, setCountdown] = useState(refreshSec);
  const pct = (countdown / refreshSec) * 100;
  const r = 7;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  useEffect(() => {
    setCountdown(refreshSec);
    const tick = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [refreshSec, refreshEpoch]);

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
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [detailFrom, setDetailFrom] = useState<"list" | "map">("list");
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const mobilePaneRef = useRef(mobilePane);
  mobilePaneRef.current = mobilePane;
  const isMobileRef = useRef(false);
  const isCompactRef = useRef(false);
  const layoutRef = useRef<"default" | "map" | "alarm">("default");

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 768px)");
    const compact = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      isMobileRef.current = mobile.matches;
      isCompactRef.current = compact.matches;
    };
    apply();
    mobile.addEventListener("change", apply);
    compact.addEventListener("change", apply);
    return () => {
      mobile.removeEventListener("change", apply);
      compact.removeEventListener("change", apply);
    };
  }, []);

  const scrollRegionIntoView = useCallback((region: string) => {
    const list = sidebarListRef.current;
    const el = regionElRefs.current.get(region);
    if (!list || !el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top - listRect.top - 8;
    if (Math.abs(delta) < 2) return;
    list.scrollTo({
      top: Math.max(0, list.scrollTop + delta),
      behavior: "auto",
    });
  }, []);

  useLayoutEffect(() => {
    if (!scrollToRegion) return;
    scrollRegionIntoView(scrollToRegion);
    setScrollToRegion(null);
  }, [scrollToRegion, openRegion, scrollRegionIntoView]);

  const handleSelectSite = useCallback(
    (siteId: string, installationId?: string, openDetail = true) => {
      setSelectedSiteId(siteId);
      setSelectedInstallationId(installationId ?? null);
      setFocusSeq((n) => n + 1);
      const site = sitesRef.current.find((s) => s.id === siteId);
      if (site?.region) setOpenRegion(site.region);
      if (
        openDetail &&
        isCompactRef.current &&
        layoutRef.current === "default"
      ) {
        if (isMobileRef.current) {
          if (mobilePaneRef.current !== "detail") {
            setDetailFrom(mobilePaneRef.current === "map" ? "map" : "list");
          }
        } else {
          setDetailFrom("list");
        }
        setMobilePane("detail");
      }
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
  layoutRef.current = layout;

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
    schedulePageRefresh(() => {
      setRefreshEpoch((n) => n + 1);
      router.refresh();
    });
  }, [router]);

  useEffect(() => bindPageRefresh(triggerRefresh), [triggerRefresh]);

  useEffect(() => {
    const tick = setInterval(() => {
      triggerRefresh();
    }, REFRESH_SEC * 1000);
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
      offline = 0,
      commLost = 0;
    for (const site of sites) {
      for (const inst of site.installations) {
        total++;
        const s = inst.device?.status ?? "offline";
        if (s === "running") running++;
        else if (s === "fault") fault++;
        else if (s === "standby" || s === "start") standby++;
        else offline++;
        if (isCommLost(inst.device?.lastSeenAt)) commLost++;
      }
    }
    return { total, running, fault, standby, offline, commLost };
  }, [sites]);

  const dashClass = [
    "new-dashboard",
    controlRoom ? "dashboard-control-room" : "",
    `dashboard-layout-${layout}`,
    `dashboard-mobile-${mobilePane}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={dashClass}>
      <div className="dash-kpi-strip">
        <LiveIndicator refreshSec={REFRESH_SEC} refreshEpoch={refreshEpoch} />
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
        <KpiBadge
          label="통신 끊김"
          value={kpis.commLost}
          variant="comm_lost"
        />
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

      {layout !== "alarm" && (
        <div className="dash-mobile-chrome">
          {mobilePane === "detail" ? (
            <div className="dash-mobile-back">
              <button
                type="button"
                onClick={() => setMobilePane(detailFrom)}
              >
                {detailFrom === "map" ? "← 지도" : "← 목록"}
              </button>
              <span className="dash-mobile-back-title">
                {selectedSite?.name ?? "현장"}
              </span>
            </div>
          ) : (
            <div
              className="dash-mobile-nav"
              role="tablist"
              aria-label="모바일 화면"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobilePane === "list"}
                onClick={() => setMobilePane("list")}
              >
                목록
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobilePane === "map"}
                onClick={() => setMobilePane("map")}
              >
                지도
              </button>
            </div>
          )}
        </div>
      )}

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
                      className={`sidebar-filter-chip${statusFilter === opt.id ? " active" : ""}${opt.id === "standby" ? " sidebar-filter-chip--standby" : ""}${opt.id === "fault" ? " sidebar-filter-chip--fault" : ""}${opt.id === "offline" ? " sidebar-filter-chip--offline" : ""}${opt.id === "comm_lost" ? " sidebar-filter-chip--comm-lost" : ""}`}
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
                            isCommLost(inst.device?.lastSeenAt),
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
                      >
                        <summary
                          className="region-group-summary"
                          onClick={(e) => {
                            e.preventDefault();
                            if (statusFilter !== "all" || searchQuery.trim())
                              return;
                            if (openRegion === region) {
                              setOpenRegion(null);
                              return;
                            }
                            setOpenRegion(region);
                            setScrollToRegion(region);
                          }}
                        >
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
                                  isCommLost(inst.device?.lastSeenAt),
                                ),
                              ),
                            );

                            if (visibleInstallations.length === 0) return null;

                            const siteListName = formatIccidListName(site.name);

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
                                    handleSelectSite(
                                      site.id,
                                      undefined,
                                      !isCompactRef.current,
                                    );
                                  }}
                                >
                                  <div
                                    className={`site-group-dot ${siteStatus}`}
                                  />
                                  <div className="site-group-info">
                                    <strong
                                      className="site-group-name"
                                      title={siteListName.title}
                                    >
                                      {siteListName.text}
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
                                  {siteHasCommLost(site) ? <CommLostBadge /> : null}
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
                                    const commLost = isCommLost(
                                      inst.device?.lastSeenAt,
                                    );
                                    const instListName = formatIccidListName(
                                      inst.label,
                                    );

                                    return (
                                      <button
                                        key={inst.id}
                                        type="button"
                                        className={`inst-card inst-card--${instStatus}${commLost ? " inst-card--comm-lost" : ""}${selectedInstallationId === inst.id ? " selected" : ""}`}
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
                                          <span
                                            className="inst-card-label"
                                            title={instListName.title}
                                          >
                                            {instListName.text}
                                          </span>
                                        </div>
                                        <span
                                          className={`site-card-badge ${instStatus}`}
                                        >
                                          {STATUS_LABEL[instStatus]}
                                        </span>
                                        {commLost ? <CommLostBadge /> : null}
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
              <KoreaMap
                allSites={sites}
                selectedSiteId={selectedSite?.id ?? ""}
                deriveSiteStatus={deriveSiteStatus}
                onSelect={handleSelectSite}
                onSelectRegion={handleSelectRegion}
              />
              <LteRadarOverlay />
            </div>

            <div className="dash-detail-slot">
              <div className="dash-tablet-back">
                <button type="button" onClick={() => setMobilePane("list")}>
                  ← 목록
                </button>
                <span className="dash-tablet-back-title">
                  {selectedSite?.name ?? "현장"}
                </span>
              </div>
              <SiteSummaryPanel
                site={selectedSite}
                showSparklines
                selectedInstallationId={selectedInstallationId}
                focusSeq={focusSeq}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
