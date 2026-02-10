"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import type { Site } from "../types/site";
import type { DeviceStatus } from "../types/device";

type Props = {
  regionEntries: [string, Site[]][];
  selectedRegion?: string;
};

const statusPriority: Record<DeviceStatus, number> = {
  fault: 4,
  offline: 3,
  start: 2,
  standby: 2,
  running: 1,
};

const deriveSiteStatus = (site: Site): DeviceStatus => {
  // 설치된 installation들의 device.status 중 가장 “심각한” 상태를 사이트 상태로
  let worst: DeviceStatus = "running";
  for (const inst of site.installations) {
    const s = inst.device?.status ?? "offline";
    if (statusPriority[s] > statusPriority[worst]) {
      worst = s;
    }
  }
  return worst;
};

const toStatusLabel = (status: DeviceStatus) => {
  switch (status) {
    case "running":
      return "RUNNING";
    case "standby":
      return "STANDBY";
    case "start":
      return "START";
    case "fault":
      return "FAULT";
    case "offline":
    default:
      return "OFFLINE";
  }
};

const toStatusClass = (status: DeviceStatus) => {
  switch (status) {
    case "running":
      return "region-device-status running";
    case "standby":
      return "region-device-status standby";
    case "start":
      return "region-device-status start";
    case "fault":
      return "region-device-status fault";
    default:
      return "region-device-status offline";
  }
};

export default function DashboardAccordion({ regionEntries, selectedRegion }: Props) {
  const refs = useRef<Record<string, HTMLDetailsElement | null>>({});

  const openRegion = useMemo(() => {
    if (selectedRegion && regionEntries.some(([r]) => r === selectedRegion)) {
      return selectedRegion;
    }
    return regionEntries[0]?.[0] ?? "기타";
  }, [selectedRegion, regionEntries]);

  useEffect(() => {
    const el = refs.current[openRegion];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openRegion]);

  return (
    <div className="region-accordion-list">
      {regionEntries.map(([region, regionSites]) => {
        const isOpen = region === openRegion;

        return (
          <details
            key={region}
            className="region-accordion"
            open={isOpen}
            ref={(node) => {
              refs.current[region] = node;
            }}
          >
            <summary className="region-accordion-summary">
              <strong className="region-title">{region}</strong>

              <span className="region-accordion-counts">
                사이트 {regionSites.length}개
              </span>

              <span className="region-accordion-chevron" aria-hidden="true">
                ▾
              </span>
            </summary>

            <div className="region-accordion-content">
              <div className="region-device-cards">
                {regionSites
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                  .map((site) => {
                    const siteStatus = deriveSiteStatus(site);
                    return (
                      <Link
                        key={site.id}
                        className="region-device-card"
                        href={`/sites/${encodeURIComponent(site.id)}`}
                      >
                        <div className="region-device-top">
                          <strong className="region-title">{site.name}</strong>
                          <span className="region-device-menu">{site.address}</span>
                        </div>

                        <div className="region-device-bottom">
                          <strong className="region-device-capacity">
                            {site.installations.length}개 설치
                          </strong>
                          <span className={toStatusClass(siteStatus)}>
                            {toStatusLabel(siteStatus)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
