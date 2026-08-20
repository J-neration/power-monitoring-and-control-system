"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Site, DeviceStatus } from "../../types/site";
import { CLIENT_LABELS, isTestClient } from "../../data/clients";
import LteSignalIndicator from "../LteSignalIndicator";
import MetricValue from "../MetricValue";
import InstallationSparkline from "../InstallationSparkline";
import {
  deriveSiteStatus,
  sortByLabel,
  STATUS_LABEL,
} from "../../lib/deviceStatus";

export default function SiteSummaryPanel({
  site,
  showSparklines = false,
  selectedInstallationId = null,
  focusSeq = 0,
}: {
  site: Site | null;
  showSparklines?: boolean;
  selectedInstallationId?: string | null;
  focusSeq?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!site || focusSeq === 0) return;
    const panel = panelRef.current;
    if (!panel) return;

    if (selectedInstallationId) {
      const card = panel.querySelector<HTMLElement>(
        `[data-inst-id="${CSS.escape(selectedInstallationId)}"]`,
      );
      if (!card) return;
      const panelRect = panel.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const offset =
        cardRect.top -
        panelRect.top -
        panel.clientHeight / 2 +
        cardRect.height / 2;
      panel.scrollTo({ top: panel.scrollTop + offset, behavior: "smooth" });
    } else {
      panel.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [site, selectedInstallationId, focusSeq]);

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
  const installations = sortByLabel(site.installations);

  return (
    <div ref={panelRef} className="dash-detail">
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
        </div>
      </div>

      <Link href={siteHref} target="_blank" className="detail-site-open">
        현장 상세보기 →
      </Link>

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
        {installations.map((inst) => {
          const instStatus = (inst.device?.status as DeviceStatus) ?? "offline";
          const d = inst.device;
          const isSelected = selectedInstallationId === inst.id;

          return (
            <Link
              key={inst.id}
              href={`/devices/${encodeURIComponent(inst.id)}`}
              target="_blank"
              data-inst-id={inst.id}
              className={`summary-inst-card${isSelected ? " selected" : ""}`}
            >
              <div className="summary-inst-header">
                <div className={`inst-card-dot ${instStatus}`} />
                <span className="summary-inst-label">{inst.label}</span>
                {isSelected ? (
                  <span className="site-group-selected-tag">선택</span>
                ) : null}
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
