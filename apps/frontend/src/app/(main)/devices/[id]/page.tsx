import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchDevice, fetchReadings, fetchFaults } from "../../../../lib/api";
import { getSessionUser } from "../../../../lib/auth-server";
import DeviceDetailTabs from "../../../../components/DeviceDetailTabs";
import LteSignalIndicator from "../../../../components/LteSignalIndicator";
import PageLiveRefresh from "../../../../components/PageLiveRefresh";
import { STATUS_LABEL } from "../../../../lib/deviceStatus";
import { isCommLost } from "../../../../lib/commStatus";
import CommLostBadge from "../../../../components/CommLostBadge";
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
  const commLost = isCommLost(device.lastSeenAt);

  return (
    <main
      className={`device-detail-page device-detail-page--${device.status}`}
    >
      {device.status === "fault" && (
        <div className="page-fault-banner" role="alert">
          <strong>이상 상태</strong> — 장비 점검이 필요합니다
        </div>
      )}
      {commLost && (
        <div className="page-comm-lost-banner" role="status">
          <strong>통신 끊김</strong> — 마지막 수신 이후 30분이 지났습니다.
          모듈 상태({STATUS_LABEL[device.status]})와 측정값은 그때의 스냅샷입니다.
        </div>
      )}

      <section className="device-detail-header device-detail-header--compact scada-panel">
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
              {commLost ? <CommLostBadge /> : null}
              {device.model ? (
                <span className="device-model-badge">
                  {device.model.toUpperCase()}
                </span>
              ) : null}
              {device.capacity != null ? (
                <span className="device-capacity-badge">
                  {device.capacity} {device.model === "paf" ? "A" : "kVAR"}
                </span>
              ) : null}
              <span className="device-detail-id">
                {site?.region ?? "-"} · {device.installationId}
              </span>
            </div>
          </div>

          <div className="device-detail-aside">
            <PageLiveRefresh installationIds={[device.installationId]} />
            <div className="device-detail-lte">
              <span className="device-detail-lte-title">LTE</span>
              <LteSignalIndicator device={device} variant="detail" />
            </div>
            <div className="device-detail-received">
              <p>
                {device.lastSeenAt
                  ? new Date(device.lastSeenAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })
                  : "-"}
              </p>
            </div>
          </div>
        </div>
      </section>

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
