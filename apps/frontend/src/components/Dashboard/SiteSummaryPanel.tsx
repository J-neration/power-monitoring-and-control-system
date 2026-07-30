"use client";

import Link from "next/link";
import type { Site, DeviceStatus } from "../../types/site";
import { CLIENT_LABELS, isTestClient } from "../../data/clients";
import LteSignalIndicator from "../LteSignalIndicator";
import MetricValue from "../MetricValue";
import InstallationSparkline from "../InstallationSparkline";
import { deriveSiteStatus, STATUS_LABEL } from "../../lib/deviceStatus";

export default function SiteSummaryPanel({
  site,
  showSparklines = false,
}: {
  site: Site | null;
  showSparklines?: boolean;
}) {
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

  const siteHref = `/sites/${encodeURIComponent(site.id)}`;

  return (
    <div className="dash-detail">
      {/* Site header */}
      <div className="detail-site-top">
        <div className={`detail-status-dot ${siteStatus}`} />
        <div className="detail-site-info">
          <h2 className="detail-site-name">
            <Link href={siteHref} target="_blank" className="detail-site-name-link">
              {site.name}
            </Link>
            {isTestClient(site.client) && (
              <span className="test-badge">TEST</span>
            )}
          </h2>
          <span className="detail-site-addr">
            {CLIENT_LABELS[site.client] ?? site.client} · {site.address}
          </span>
        </div>
        <div className="detail-site-actions">
          <span className={`detail-status-badge ${siteStatus}`}>
            {STATUS_LABEL[siteStatus]}
          </span>
          <Link href={siteHref} target="_blank" className="detail-site-open">
            상세보기
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="summary-stats-row">
        <div className="summary-stat">
          <span className="summary-stat-value">{stats.total}</span>
          <span className="summary-stat-label">설치지점</span>
        </div>
        <div className="summary-stat summary-stat-ok">
          <span className="summary-stat-value">{stats.running}</span>
          <span className="summary-stat-label">가동</span>
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
              target="_blank"
              className="summary-inst-card"
            >
              <div className="summary-inst-header">
                <div className={`inst-card-dot ${instStatus}`} />
                <span className="summary-inst-label">{inst.label}</span>
                <span className={`site-card-badge ${instStatus}`}>
                  {STATUS_LABEL[instStatus]}
                </span>
              </div>
              <div className="summary-inst-lte">
                <span className="summary-inst-lte-title">LTE 신호</span>
                <LteSignalIndicator device={d} variant="detail" />
              </div>
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
                <div className="sit-row sit-row-pf">
                  <span className="sit-label">TPF2 / DPF2</span>
                  <MetricValue value={d?.tpf2} suffix="%" />
                  <MetricValue value={d?.dpf2} suffix="%" />
                  <span />
                </div>
                <div className="sit-row">
                  <span className="sit-label">Grid THD (%)</span>
                  <MetricValue value={d?.gridCurrentTHDL1} kind="thd" />
                  <MetricValue value={d?.gridCurrentTHDL2} kind="thd" />
                  <MetricValue value={d?.gridCurrentTHDL3} kind="thd" />
                </div>
                {showSparklines && (
                  <div className="site-inst-trends">
                    <div className="summary-inst-sparkline">
                      <span className="sit-label">THD 1h</span>
                      <InstallationSparkline
                        installationId={inst.id}
                        hours={1}
                        metric="thd"
                      />
                    </div>
                    <div className="summary-inst-sparkline">
                      <span className="sit-label">TPF 1h</span>
                      <InstallationSparkline
                        installationId={inst.id}
                        hours={1}
                        metric="pf"
                      />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer link */}
      <Link href={siteHref} target="_blank" className="summary-more-link">
        현장 상세보기 →
      </Link>
    </div>
  );
}
