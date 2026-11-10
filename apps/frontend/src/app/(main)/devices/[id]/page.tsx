import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchDevice, fetchOpsSamples, fetchReadings, fetchFaults } from "../../../../lib/api";
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
  /** 영업 열람: 관리자처럼 Fault 이력·장기 이력은 보되 설정·제어는 없다 */
  const isViewer = sessionUser?.role === "VIEWER";
  /** 출고검사: Fault 이력은 보되 설정·제어는 없다 */
  const isInspector = sessionUser?.role === "INSPECTOR";

  const [device, readings, savingsReadings, faults] = await Promise.all([
    fetchDevice(id) as Promise<DeviceWithInstallation | null>,
    fetchReadings(id, HISTORY_HOURS),
    fetchOpsSamples(id),
    isAdmin || isViewer || isInspector ? fetchFaults(id) : Promise.resolve([]),
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
        savingsReadings={savingsReadings}
        hours={HISTORY_HOURS}
        isAdmin={isAdmin}
        isViewer={isViewer}
        isInspector={isInspector}
        adminUsername={sessionUser?.username}
        faults={faults}
      />
    </main>
  );
}
