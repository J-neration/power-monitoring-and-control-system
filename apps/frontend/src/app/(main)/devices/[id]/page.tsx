import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDevice, fetchReadings } from "../../../../lib/api";
import { getSessionUser } from "../../../../lib/auth-server";
import DeviceDetailTabs from "../../../../components/DeviceDetailTabs";
import type { DeviceWithInstallation } from "../../../../types/site";

type Props = {
  params: { id: string };
};

const HISTORY_HOURS = 24;

export default async function DeviceDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const [device, readings] = await Promise.all([
    fetchDevice(id) as Promise<DeviceWithInstallation | null>,
    fetchReadings(id, HISTORY_HOURS),
  ]);

  if (!device) notFound();

  const sessionUser = await getSessionUser();
  const isAdmin = sessionUser?.role === "ADMIN";

  const site = device.installation?.site;
  const siteId = site?.id;
  const deviceLabel = device.installation?.label ?? "Installation";

  return (
    <main className="device-detail-page">
      <section className="device-detail-header">
        <div className="device-detail-header-inner">
          <div className="device-detail-header-main">
            <nav className="device-breadcrumb">
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

            <div className="device-detail-title-row">
              <h1>{deviceLabel}</h1>
              <span className={`detail-status-badge ${device.status}`}>
                {device.status.toUpperCase()}
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
                <span className="device-capacity-badge">{device.capacity} A</span>
              ) : null}{" "}
              ID: {device.installationId}
            </p>
          </div>

          <div className="device-detail-received">
            <p>
              Received{" "}
              {device.lastSeenAt
                ? new Date(device.lastSeenAt).toLocaleString()
                : "-"}
            </p>
            {device.lastIp ? <p>IP {device.lastIp}</p> : null}
          </div>
        </div>
      </section>

      <DeviceDetailTabs
        device={device}
        readings={readings}
        hours={HISTORY_HOURS}
        isAdmin={isAdmin}
        adminUsername={sessionUser?.username}
      />
    </main>
  );
}
