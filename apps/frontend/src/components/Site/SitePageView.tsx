"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Site, Device, DeviceStatus } from "../../types/site";
import { CLIENT_LABELS } from "../../data/clients";
import MetricValue from "../MetricValue";
import SiteInstTrends from "../SiteInstTrends";
import LteSignalIndicator from "../LteSignalIndicator";
import PageLiveRefresh from "../PageLiveRefresh";
import ModuleSlotGrid from "../ModuleSlotGrid";
import {
  deriveSiteStatus,
  installationMatchesFilter,
  STATUS_LABEL,
  type StatusFilter,
} from "../../lib/deviceStatus";

const FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "fault", label: "이상" },
  { id: "offline", label: "오프라인" },
];

function countStatuses(installations: { device: Device | null }[]) {
  let running = 0,
    standby = 0,
    fault = 0,
    offline = 0;
  for (const inst of installations) {
    const s = inst.device?.status ?? "offline";
    if (s === "running") running++;
    else if (s === "fault") fault++;
    else if (s === "standby" || s === "start") standby++;
    else offline++;
  }
  return { total: installations.length, running, standby, fault, offline };
}

function formatLastSeen(
  installations: { device: { lastSeenAt: string } | null }[],
) {
  const latest = installations
    .map((x) => (x.device ? Date.parse(x.device.lastSeenAt) : NaN))
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

function instPriority(status: DeviceStatus): number {
  const order: Record<DeviceStatus, number> = {
    fault: 4,
    offline: 3,
    start: 2,
    standby: 2,
    running: 1,
  };
  return order[status];
}

export default function SitePageView({ site }: { site: Site }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const siteStatus = deriveSiteStatus(site);
  const stats = countStatuses(site.installations);
  const installationIds = site.installations.map((i) => i.id);

  const installations = useMemo(() => {
    const filtered = site.installations.filter((inst) =>
      installationMatchesFilter(
        (inst.device?.status as DeviceStatus) ?? "offline",
        statusFilter,
      ),
    );
    return [...filtered].sort((a, b) => {
      const sa = (a.device?.status as DeviceStatus) ?? "offline";
      const sb = (b.device?.status as DeviceStatus) ?? "offline";
      const diff = instPriority(sb) - instPriority(sa);
      if (diff !== 0) return diff;
      return a.label.localeCompare(b.label, "ko");
    });
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
            <div className={`detail-status-dot ${siteStatus}`} />
            <h1>{site.name}</h1>
            <span className={`detail-status-badge ${siteStatus}`}>
              {STATUS_LABEL[siteStatus]}
            </span>
          </div>
          <p className="site-header-meta">
            {CLIENT_LABELS[site.client] ?? site.client} · {site.region} ·{" "}
            {site.address}
          </p>
          <p className="site-header-meta">
            마지막 수신 {formatLastSeen(site.installations)}
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
          </div>
        </div>
      </header>

      <div className="site-toolbar">
        <div className="sidebar-filters" role="group" aria-label="상태 필터">
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

      <section className="site-card-grid">
        {installations.length === 0 ? (
          <p className="sidebar-empty">해당 상태의 설치지점이 없습니다</p>
        ) : (
          installations.map((inst) => {
            const d = inst.device;
            const instStatus = (d?.status as DeviceStatus) ?? "offline";

            return (
              <Link
                key={inst.id}
                href={`/devices/${encodeURIComponent(inst.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`site-inst-card site-inst-card--${instStatus}`}
              >
                <div className="site-inst-top">
                  <div className={`site-inst-dot ${instStatus}`} />
                  <span className="site-inst-label">{inst.label}</span>
                  <LteSignalIndicator device={d} variant="compact" />
                  <span className={`detail-status-badge ${instStatus}`}>
                    {STATUS_LABEL[instStatus]}
                  </span>
                </div>

                <div className="site-inst-meta-row">
                  {d?.model && (
                    <span className="device-model-badge">
                      {d.model.toUpperCase()}
                    </span>
                  )}
                  {d?.capacity != null && (
                    <span className="device-capacity-badge">
                      {d.capacity} {d.model === "paf" ? "A" : "kVAR"}
                    </span>
                  )}
                </div>

                <div className="site-inst-divider" />

                <div className="site-inst-table">
                  <div className="sit-row">
                    <span className="sit-label">V (V)</span>
                    <MetricValue value={d?.vL1} kind="voltage" />
                    <MetricValue value={d?.vL2} kind="voltage" />
                    <MetricValue value={d?.vL3} kind="voltage" />
                  </div>
                  <div className="sit-row">
                    <span className="sit-label">Grid I (A)</span>
                    <MetricValue value={d?.gridCurrentL1} />
                    <MetricValue value={d?.gridCurrentL2} />
                    <MetricValue value={d?.gridCurrentL3} />
                  </div>
                  <div className="sit-row">
                    <span className="sit-label">Grid THD (%)</span>
                    <MetricValue value={d?.gridCurrentTHDL1} kind="thd" />
                    <MetricValue value={d?.gridCurrentTHDL2} kind="thd" />
                    <MetricValue value={d?.gridCurrentTHDL3} kind="thd" />
                  </div>
                  <div className="sit-row sit-row-pf">
                    <span className="sit-label">Grid TPF / DPF</span>
                    <MetricValue value={d?.tpf2} kind="pf" suffix="%" />
                    <MetricValue value={d?.dpf2} kind="pf" suffix="%" />
                    <span />
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
