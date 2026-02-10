"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Device } from "../types/device";

const toInt = (value?: number | string) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const summarizeStatus = (devices: Device[]) => {
  return devices.reduce(
    (acc, device) => {
      const totalMods =
        toInt(device.numOfMods) ??
        (device.moduleStatus ? device.moduleStatus.length : 0);
      const list = device.moduleStatus ?? [];
      const running = list.filter((code) => code === 2).length;
      const fault = list.filter((code) => code === 3).length;
      const check = list.filter((code) => code !== 2 && code !== 3).length;
      const missing = Math.max(0, totalMods - list.length);

      acc.total += totalMods;
      acc.ok += running;
      acc.fault += fault;
      acc.check += check + missing;
      return acc;
    },
    { total: 0, ok: 0, check: 0, fault: 0 },
  );
};

const toStatusLabel = (status?: Device["status"]) => {
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

const toStatusClass = (status?: Device["status"]) => {
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

const formatCapacity = (value?: number | string) => {
  const parsed = toInt(value);
  if (!parsed || parsed <= 0) return "-";
  return `${parsed}A`;
};

type Props = {
  regionEntries: [string, Device[]][];
  selectedRegion?: string;
};

export default function DashboardAccordion({ regionEntries, selectedRegion }: Props) {
  const refs = useRef<Record<string, HTMLDetailsElement | null>>({});

  // ✅ 열릴 region 결정: 쿼리가 유효하면 그걸, 아니면 첫 번째 region
  const openRegion = useMemo(() => {
    if (selectedRegion && regionEntries.some(([r]) => r === selectedRegion)) {
      return selectedRegion;
    }
    return regionEntries[0]?.[0] ?? "기타";
  }, [selectedRegion, regionEntries]);

  // ✅ 선택된 region 아코디언으로 스크롤
  useEffect(() => {
    const el = refs.current[openRegion];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openRegion]);

  return (
    <div className="region-accordion-list">
      {regionEntries.map(([region, regionDevices]) => {
        const regionSummary = summarizeStatus(regionDevices);
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
                합계 {regionSummary.total} · 정상 {regionSummary.ok} · 점검{" "}
                {regionSummary.check} · 고장 {regionSummary.fault}
              </span>

              <span className="region-accordion-chevron" aria-hidden="true">
                ▾
              </span>
            </summary>

            <div className="region-accordion-content">
              <div className="region-device-cards">
                {regionDevices
                  .slice()
                  .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"))
                  .map((device) => (
                    <Link
                      key={device.id}
                      className="region-device-card"
                      href={`/devices/${encodeURIComponent(device.id)}`}
                    >
                      <div className="region-device-top">
                        <strong className="region-title">{device.name ?? "-"}</strong>
                      </div>

                      <div className="region-device-bottom">
                        <strong className="region-device-capacity">
                          {formatCapacity(device.capacity)}
                        </strong>
                        <span className={toStatusClass(device.status)}>
                          {toStatusLabel(device.status)}
                        </span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
