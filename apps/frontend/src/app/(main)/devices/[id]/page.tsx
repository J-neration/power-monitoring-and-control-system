import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchDevice, fetchReadings, fetchFaults } from "../../../../lib/api";
import { getSessionUser } from "../../../../lib/auth-server";
import DeviceDetailTabs from "../../../../components/DeviceDetailTabs";
import PageLiveRefresh from "../../../../components/PageLiveRefresh";
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

      <section className="device-detail-header device-detail-header--compact device-detail-header--crumb scada-panel">
        <div className="device-detail-header-inner">
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
          <PageLiveRefresh installationIds={[device.installationId]} />
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
