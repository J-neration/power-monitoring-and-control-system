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

const fmt = (v: unknown, digits = 1) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(digits) : "-";
  return "-";
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

      const mods = inst.device?.moduleStatus ?? [];
      acc.totalMods += mods.length;
      acc.okMods += mods.filter((m) => m === 2).length;
      return acc;
    },
    { total: 0, running: 0, fault: 0, standby: 0, offline: 0, totalMods: 0, okMods: 0 },
  );

  const modPct = stats.totalMods > 0 ? Math.round((stats.okMods / stats.totalMods) * 100) : null;

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
          <span className="summary-stat-value">{stats.fault + stats.offline}</span>
          <span className="summary-stat-label">이상</span>
        </div>
      </div>

      {/* Module health bar */}
      {modPct !== null && (
        <div className="mod-health-row">
          <span className="mod-health-label">모듈 건강도</span>
          <div className="mod-health-track">
            <div
              className={`mod-health-fill${modPct >= 80 ? " good" : modPct >= 50 ? " warn" : " bad"}`}
              style={{ width: `${modPct}%` }}
            />
          </div>
          <span className="mod-health-pct">
            {stats.okMods}/{stats.totalMods} ({modPct}%)
          </span>
        </div>
      )}

      {/* Installation cards */}
      <div className="summary-inst-grid">
        {site.installations.map((inst) => {
          const instStatus = (inst.device?.status as DeviceStatus) ?? "offline";
          const d = inst.device;
          const avgThd =
            d?.gridCurrentTHDL1 != null && d?.gridCurrentTHDL2 != null && d?.gridCurrentTHDL3 != null
              ? (d.gridCurrentTHDL1 + d.gridCurrentTHDL2 + d.gridCurrentTHDL3) / 3
              : null;

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
              <div className="summary-inst-metrics">
                {inst.capacity && (
                  <div className="summary-inst-metric">
                    <span>용량</span>
                    <strong>{inst.capacity} kW</strong>
                  </div>
                )}
                <div className="summary-inst-metric">
                  <span>TPF</span>
                  <strong>
                    {d?.tpf2 != null ? `${(d.tpf2 * 100).toFixed(1)}%` : "-"}
                  </strong>
                </div>
                <div className="summary-inst-metric">
                  <span>THD avg</span>
                  <strong>{avgThd != null ? `${fmt(avgThd)}%` : "-"}</strong>
                </div>
                <div className="summary-inst-metric">
                  <span>P</span>
                  <strong>
                    {d?.compP != null ? `${fmt(d.compP)} kW` : "-"}
                  </strong>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer link */}
      <Link href={`/sites/${encodeURIComponent(site.id)}`} className="summary-more-link">
        현장 상세보기 →
      </Link>
    </div>
  );
}
