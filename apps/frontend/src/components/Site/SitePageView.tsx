"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Site, Device, DeviceStatus } from "../../types/site";
import { CLIENT_LABELS } from "../../data/clients";
import MetricValue from "../MetricValue";
import SiteInstTrends from "../SiteInstTrends";
import LteSignalIndicator from "../LteSignalIndicator";
import CommLostBadge from "../CommLostBadge";
import PageLiveRefresh from "../PageLiveRefresh";
import ModuleSlotGrid from "../ModuleSlotGrid";
import { useHasMounted } from "../../hooks/useHasMounted";
import {
  deriveSiteStatus,
  installationMatchesFilter,
  sortByLabel,
  STATUS_LABEL,
  type StatusFilter,
} from "../../lib/deviceStatus";
import { isCommLost } from "../../lib/commStatus";

const FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "fault", label: "이상" },
  { id: "offline", label: "오프라인" },
  { id: "comm_lost", label: "통신 끊김" },
];

function countStatuses(installations: { device: Device | null }[]) {
  let running = 0,
    standby = 0,
    fault = 0,
    offline = 0,
    commLost = 0;
  for (const inst of installations) {
    const s = inst.device?.status ?? "offline";
    if (s === "running") running++;
    else if (s === "fault") fault++;
    else if (s === "standby" || s === "start") standby++;
    else offline++;
    if (isCommLost(inst.device?.lastSeenAt)) commLost++;
  }
  return { total: installations.length, running, standby, fault, offline, commLost };
}

function formatLastSeen(
  installations: { device: { lastSeenAt: string | null } | null }[],
) {
  const latest = installations
    .map((x) =>
      x.device?.lastSeenAt ? Date.parse(x.device.lastSeenAt) : NaN,
    )
    .filter((v) => Number.isFinite(v))
    .reduce((max, v) => (v > max ? v : max), 0);
  if (!latest) return "-";
  const diff = Date.now() - latest;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

export default function SitePageView({ site }: { site: Site }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const mounted = useHasMounted();

  const siteStatus = deriveSiteStatus(site);
  const stats = countStatuses(site.installations);
  const installationIds = site.installations.map((i) => i.id);

  const installations = useMemo(() => {
    const filtered = site.installations.filter((inst) =>
      installationMatchesFilter(
        (inst.device?.status as DeviceStatus) ?? "offline",
        statusFilter,
        isCommLost(inst.device?.lastSeenAt),
      ),
    );
    return sortByLabel(filtered);
  }, [site.installations, statusFilter]);

  return (
    <main className={`site-page site-page--${siteStatus}`}>
      <nav className="site-nav page-breadcrumb">
        <Link href="/" className="site-nav-link">
          대시보드
        </Link>
        <span className="site-nav-sep">/</span>
        <span className="site-nav-current">{site.name}</span>
      </nav>

      <header className="site-header scada-panel">
        <div className="site-header-left">
          <div className="site-header-title">
            <div className="site-header-identity">
              <div className={`detail-status-dot ${siteStatus}`} />
              <h1>{site.name}</h1>
            </div>
            <div className="site-header-flags">
              <span className={`detail-status-badge ${siteStatus}`}>
                {STATUS_LABEL[siteStatus]}
              </span>
              {stats.commLost > 0 ? <CommLostBadge /> : null}
            </div>
          </div>
          <p className="site-header-meta">
            {CLIENT_LABELS[site.client] ?? site.client} · {site.region} ·{" "}
            {site.address}
          </p>
          <p className="site-header-meta">
            마지막 수신{" "}
            {mounted ? formatLastSeen(site.installations) : "-"}
          </p>
        </div>

        <div className="site-header-right">
          <PageLiveRefresh installationIds={installationIds} />
          <div className="site-stats-row">
            <div className="site-stat">
              <span className="site-stat-val">{stats.total}</span>
              <span className="site-stat-lbl">설치지점</span>
            </div>
            <div className="site-stat site-stat-ok">
              <span className="site-stat-val">{stats.running}</span>
              <span className="site-stat-lbl">가동</span>
            </div>
            <div className="site-stat site-stat-warn">
              <span className="site-stat-val">{stats.standby}</span>
              <span className="site-stat-lbl">대기</span>
            </div>
            <div className="site-stat site-stat-err">
              <span className="site-stat-val">
                {stats.fault + stats.offline}
              </span>
              <span className="site-stat-lbl">이상</span>
            </div>
            <div className="site-stat site-stat-comm">
              <span className="site-stat-val">{stats.commLost}</span>
              <span className="site-stat-lbl">통신 끊김</span>
            </div>
          </div>
        </div>
      </header>

      <div className="site-toolbar">
        <div className="sidebar-filters" role="group" aria-label="상태 필터">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`sidebar-filter-chip${statusFilter === opt.id ? " active" : ""}${opt.id === "fault" ? " sidebar-filter-chip--fault" : ""}${opt.id === "offline" ? " sidebar-filter-chip--offline" : ""}${opt.id === "comm_lost" ? " sidebar-filter-chip--comm-lost" : ""}`}
              onClick={() => setStatusFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <section className="site-card-grid">
        {installations.length === 0 ? (
          <p className="sidebar-empty">해당 상태의 설치지점이 없습니다</p>
        ) : (
          installations.map((inst) => {
            const d = inst.device;
            const instStatus = (d?.status as DeviceStatus) ?? "offline";
            const commLost = isCommLost(d?.lastSeenAt);

            return (
              <Link
                key={inst.id}
                href={`/devices/${encodeURIComponent(inst.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`site-inst-card site-inst-card--${instStatus}${commLost ? " site-inst-card--comm-lost" : ""}`}
              >
                <div className="site-inst-top">
                  <div className="site-inst-row site-inst-row--name">
                    <div className={`site-inst-dot ${instStatus}`} />
                    <span className="site-inst-label">{inst.label}</span>
                    <LteSignalIndicator device={d} variant="compact" />
                  </div>
                  <div className="site-inst-row site-inst-row--status">
                    <span className={`detail-status-badge ${instStatus}`}>
                      {STATUS_LABEL[instStatus]}
                    </span>
                    {commLost ? <CommLostBadge /> : null}
                  </div>
                  {d?.model || d?.capacity != null ? (
                    <div className="site-inst-row site-inst-row--spec">
                      {[
                        d.model?.toUpperCase(),
                        d.capacity != null
                          ? `${d.capacity}${d.model === "paf" ? "A" : "kVAR"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                  ) : null}
                </div>

                <div className="site-inst-readout">
                  <div className="site-inst-readout-head">
                    <span />
                    <span>L1</span>
                    <span>L2</span>
                    <span>L3</span>
                  </div>
                  <div className="site-inst-readout-row">
                    <span className="site-inst-readout-lbl">V</span>
                    <MetricValue value={d?.vL1} kind="voltage" />
                    <MetricValue value={d?.vL2} kind="voltage" />
                    <MetricValue value={d?.vL3} kind="voltage" />
                  </div>
                  <div className="site-inst-readout-row">
                    <span className="site-inst-readout-lbl">I</span>
                    <MetricValue value={d?.gridCurrentL1} />
                    <MetricValue value={d?.gridCurrentL2} />
                    <MetricValue value={d?.gridCurrentL3} />
                  </div>
                  <div className="site-inst-readout-row">
                    <span className="site-inst-readout-lbl">THD</span>
                    <MetricValue value={d?.gridCurrentTHDL1} kind="thd" />
                    <MetricValue value={d?.gridCurrentTHDL2} kind="thd" />
                    <MetricValue value={d?.gridCurrentTHDL3} kind="thd" />
                  </div>
                  <div className="site-inst-readout-row site-inst-readout-row--single">
                    <span className="site-inst-readout-lbl">TPF</span>
                    <MetricValue value={d?.tpf2} kind="pf" suffix="%" />
                  </div>
                  <div className="site-inst-readout-row site-inst-readout-row--single">
                    <span className="site-inst-readout-lbl">DPF</span>
                    <MetricValue value={d?.dpf2} kind="pf" suffix="%" />
                  </div>
                </div>

                <SiteInstTrends installationId={inst.id} />

                <ModuleSlotGrid
                  moduleStatus={d?.moduleStatus}
                  numOfMods={d?.numOfMods}
                  compact
                />
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
