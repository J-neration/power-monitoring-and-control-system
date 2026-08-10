import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchDevice, fetchReadings, fetchFaults } from "../../../../lib/api";
import { getSessionUser } from "../../../../lib/auth-server";
import DeviceDetailTabs from "../../../../components/DeviceDetailTabs";
import DeviceKpiStrip from "../../../../components/DeviceKpiStrip";
import LteSignalIndicator from "../../../../components/LteSignalIndicator";
import PageLiveRefresh from "../../../../components/PageLiveRefresh";
import { STATUS_LABEL } from "../../../../lib/deviceStatus";
import type { DeviceWithInstallation } from "../../../../types/site";
type Props = {
  params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const device = await fetchDevice(decodeURIComponent(params.id)) as DeviceWithInstallation | null;
  const label = device?.installation?.label ?? "장비 상세";
  const siteName = device?.installation?.site?.name;
  return { title: siteName ? `${label} - ${siteName}` : label };
}

const HISTORY_HOURS = 24;

export default async function DeviceDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const sessionUser = await getSessionUser();
  const isAdmin = sessionUser?.role === "ADMIN";

  const [device, readings, faults] = await Promise.all([
    fetchDevice(id) as Promise<DeviceWithInstallation | null>,
    fetchReadings(id, HISTORY_HOURS),
    isAdmin ? fetchFaults(id) : Promise.resolve([]),
  ]);

  if (!device) {
    // If a non-installation id is entered on /devices, prefer sending
    // the user to the site route instead of a hard 404.
    redirect(`/sites/${encodeURIComponent(id)}`);
  }

  const site = device.installation?.site;
  const siteId = site?.id;
  const deviceLabel = device.installation?.label ?? "Installation";

  return (
    <main
      className={`device-detail-page device-detail-page--${device.status}`}
    >
      {device.status === "fault" && (
        <div className="page-fault-banner" role="alert">
          <strong>이상 상태</strong> — 장비 점검이 필요합니다
        </div>
      )}

      <section className="device-detail-header scada-panel">
        <div className="device-detail-header-inner">
          <div className="device-detail-header-main">
            <nav className="device-breadcrumb page-breadcrumb">
              <Link href="/" className="breadcrumb-item">
                대시보드
              </Link>
              <span className="breadcrumb-sep">/</span>
              {siteId ? (
                <Link
                  href={`/sites/${encodeURIComponent(siteId)}`}
                  target="_blank"
                  className="breadcrumb-item"
                >
                  {site?.name ?? "현장"}
                </Link>
              ) : (
                <span className="breadcrumb-item breadcrumb-current">현장</span>
              )}
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item breadcrumb-current">
                {deviceLabel}
              </span>
            </nav>

            <div className="device-detail-title-row">
              <div className={`detail-status-dot ${device.status}`} />
              <h1>{deviceLabel}</h1>
              <span className={`detail-status-badge ${device.status}`}>
                {STATUS_LABEL[device.status]}
              </span>
            </div>

            <p className="detail-subtitle">
              {site?.region ?? "-"} {site?.address ?? ""}
            </p>
            <p className="detail-subtitle">
              {device.model ? (
                <span className="device-model-badge">
                  {device.model.toUpperCase()}
                </span>
              ) : null}
              {device.capacity != null ? (
                <span className="device-capacity-badge">
                  {device.capacity}{" "}
                  {device.model === "paf" ? "A" : "kVAR"}
                </span>
              ) : null}{" "}
              ID: {device.installationId}
            </p>
          </div>

          <div className="device-detail-aside">
            <PageLiveRefresh installationIds={[device.installationId]} />
            <div className="device-detail-lte">
              <span className="device-detail-lte-title">LTE 신호</span>
              <LteSignalIndicator device={device} variant="detail" />
            </div>
            <div className="device-detail-received">
              <p>
                마지막 수신{" "}
                {device.lastSeenAt
                  ? new Date(device.lastSeenAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })
                  : "-"}
              </p>
              {device.lastIp ? <p>IP {device.lastIp}</p> : null}
            </div>
          </div>
        </div>
      </section>

      <DeviceKpiStrip device={device} />

      <DeviceDetailTabs
        device={device}
        readings={readings}
        hours={HISTORY_HOURS}
        isAdmin={isAdmin}
        adminUsername={sessionUser?.username}
        faults={faults}
      />
    </main>
  );
}
