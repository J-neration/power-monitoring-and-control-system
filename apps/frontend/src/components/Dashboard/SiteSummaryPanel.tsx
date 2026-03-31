"use client";

import Link from "next/link";
import type { Site, DeviceStatus } from "../../types/site";
import { CLIENT_LABELS } from "../../data/clients";

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


export default function SiteSummaryPanel({ site }: { site: Site | null }) {
  if (!site) {
    return (
      <div className="dash-detail dash-detail-empty">
        <p>지도 또는 목록에서 현장을 선택하세요</p>
      </div>
    );
  }

  const siteStatus = deriveSiteStatus(site);

  const stats = site.installations.reduce(
    (acc, inst) => {
      acc.total++;
      const s = inst.device?.status ?? "offline";
      if (s === "running") acc.running++;
      else if (s === "fault") acc.fault++;
      else if (s === "standby" || s === "start") acc.standby++;
      else acc.offline++;
      return acc;
    },
    { total: 0, running: 0, fault: 0, standby: 0, offline: 0 },
  );

  return (
    <div className="dash-detail">
      {/* Site header */}
      <div className="detail-site-top">
        <div className={`detail-status-dot ${siteStatus}`} />
        <div className="detail-site-info">
          <h2 className="detail-site-name">{site.name}</h2>
          <span className="detail-site-addr">
            {CLIENT_LABELS[site.client] ?? site.client} · {site.address}
          </span>
        </div>
        <span className={`detail-status-badge ${siteStatus}`}>
          {STATUS_LABEL[siteStatus]}
        </span>
      </div>

      {/* Summary stats */}
      <div className="summary-stats-row">
        <div className="summary-stat">
          <span className="summary-stat-value">{stats.total}</span>
          <span className="summary-stat-label">설치지점</span>
        </div>
        <div className="summary-stat summary-stat-ok">
          <span className="summary-stat-value">{stats.running}</span>
          <span className="summary-stat-label">정상</span>
        </div>
        <div className="summary-stat summary-stat-warn">
          <span className="summary-stat-value">{stats.standby}</span>
          <span className="summary-stat-label">대기</span>
        </div>
        <div className="summary-stat summary-stat-fault">
          <span className="summary-stat-value">
            {stats.fault + stats.offline}
          </span>
          <span className="summary-stat-label">이상</span>
        </div>
      </div>

      {/* Installation cards */}
      <div className="summary-inst-grid">
        {site.installations.map((inst) => {
          const instStatus = (inst.device?.status as DeviceStatus) ?? "offline";
          const d = inst.device;

          return (
            <Link
              key={inst.id}
              href={`/devices/${encodeURIComponent(inst.id)}`}
              className="summary-inst-card"
            >
              <div className="summary-inst-header">
                <div className={`inst-card-dot ${instStatus}`} />
                <span className="summary-inst-label">{inst.label}</span>
                <span className={`site-card-badge ${instStatus}`}>
                  {STATUS_LABEL[instStatus]}
                </span>
              </div>
              <div className="site-inst-table">
                <div className="sit-row">
                  <span className="sit-label">V (V)</span>
                  <span>{d?.vL1 != null ? d.vL1.toFixed(1) : "-"}</span>
                  <span>{d?.vL2 != null ? d.vL2.toFixed(1) : "-"}</span>
                  <span>{d?.vL3 != null ? d.vL3.toFixed(1) : "-"}</span>
                </div>
                <div className="sit-row">
                  <span className="sit-label">Grid I (A)</span>
                  <span>{d?.gridCurrentL1 != null ? d.gridCurrentL1.toFixed(1) : "-"}</span>
                  <span>{d?.gridCurrentL2 != null ? d.gridCurrentL2.toFixed(1) : "-"}</span>
                  <span>{d?.gridCurrentL3 != null ? d.gridCurrentL3.toFixed(1) : "-"}</span>
                </div>
                <div className="sit-row sit-row-pf">
                  <span className="sit-label">TPF2 / DPF2</span>
                  <span>{d?.tpf2 != null ? `${d.tpf2.toFixed(1)}%` : "-"}</span>
                  <span>{d?.dpf2 != null ? `${d.dpf2.toFixed(1)}%` : "-"}</span>
                  <span />
                </div>
                <div className="sit-row">
                  <span className="sit-label">Grid THD (%)</span>
                  <span>{d?.gridCurrentTHDL1 != null ? d.gridCurrentTHDL1.toFixed(1) : "-"}</span>
                  <span>{d?.gridCurrentTHDL2 != null ? d.gridCurrentTHDL2.toFixed(1) : "-"}</span>
                  <span>{d?.gridCurrentTHDL3 != null ? d.gridCurrentTHDL3.toFixed(1) : "-"}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer link */}
      <Link
        href={`/sites/${encodeURIComponent(site.id)}`}
        className="summary-more-link"
      >
        현장 상세보기 →
      </Link>
    </div>
  );
}
