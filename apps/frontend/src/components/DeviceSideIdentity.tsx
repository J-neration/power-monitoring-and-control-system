"use client";

import { useEffect, useState } from "react";
import type { DeviceWithInstallation } from "../types/site";
import { STATUS_LABEL } from "../lib/deviceStatus";
import { isCommLost } from "../lib/commStatus";
import { formatLastSeen } from "../lib/lteSignal";
import { useHasMounted } from "../hooks/useHasMounted";
import { deviceModelVersionSpec } from "../lib/deviceSettingsFields";
import CommLostBadge from "./CommLostBadge";
import LteSignalIndicator from "./LteSignalIndicator";

function nestedModuleType(device: DeviceWithInstallation): string | null {
  const inst = device.installation as {
    deviceSettings?: { moduleType?: string | null };
  };
  return inst?.deviceSettings?.moduleType ?? device.moduleType ?? null;
}

export default function DeviceSideIdentity({
  device,
}: {
  device: DeviceWithInstallation;
}) {
  const mounted = useHasMounted();
  const site = device.installation?.site;
  const label = device.installation?.label ?? device.installationId;
  const commLost = isCommLost(device.lastSeenAt);
  const lastSeenRel = mounted ? formatLastSeen(device.lastSeenAt) : null;
  const lastSeenAbs = device.lastSeenAt
    ? new Date(device.lastSeenAt).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const [settingsModuleType, setSettingsModuleType] = useState<string | null>(
    null,
  );
  const moduleType = nestedModuleType(device) ?? settingsModuleType;
  const spec = deviceModelVersionSpec({
    model: device.model,
    moduleType,
  });

  useEffect(() => {
    if (nestedModuleType(device)) return;
    const id = device.installationId;
    let cancelled = false;
    fetch(`/api/devices/${encodeURIComponent(id)}/settings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { settings?: { moduleType?: string | null } } | null) => {
        if (cancelled) return;
        const mt = data?.settings?.moduleType;
        if (typeof mt === "string" && mt.trim()) setSettingsModuleType(mt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [device.installationId, device.moduleType]);

  return (
    <section className="device-side-identity">
      <div className="device-side-identity-head">
        <div className="device-side-identity-title">
          <div className={`detail-status-dot ${device.status}`} />
          <h1>{label}</h1>
          <span className={`detail-status-badge ${device.status}`}>
            {STATUS_LABEL[device.status]}
          </span>
        </div>
        {spec ? <p className="device-side-identity-spec">{spec}</p> : null}
        <p className="device-side-identity-id">
          {site?.region ?? "-"} · {device.installationId}
        </p>
      </div>

      <div className="device-side-identity-link">
        <div className="device-side-identity-link-row">
          <span className="device-side-identity-lte-label">LTE</span>
          <LteSignalIndicator device={device} variant="compact" />
          {commLost ? <CommLostBadge /> : null}
        </div>
        {lastSeenAbs ? (
          <p className="device-side-identity-seen">
            {lastSeenRel ? `${lastSeenRel} · ` : null}
            {lastSeenAbs}
          </p>
        ) : (
          <p className="device-side-identity-seen">수신 기록 없음</p>
        )}
      </div>
    </section>
  );
}
