import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDevice } from "../../../lib/api";
import { StatusCard } from "../../../components/StatusCard";
import DeviceDetailChartsLazy from "../../../components/DeviceDetailChartsLazy";
import type { DeviceWithInstallation } from "../../../types/site";

type Props = {
  params: { id: string };
};

function formatLastSeen(iso?: string | null) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

export default async function DeviceDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const device = (await fetchDevice(id)) as DeviceWithInstallation | null;

  if (!device) notFound();

  const site = device.installation?.site;
  const siteId = site?.id;
  const title = `${site?.name ?? "Site"} / ${device.installation?.label ?? "Installation"}`;

  return (
    <main className="device-detail-page">
      <section className="device-detail-header">
        <div className="device-detail-nav">
          {siteId ? (
            <Link
              className="detail-back"
              href={`/sites/${encodeURIComponent(siteId)}`}
            >
              ← {site?.name ?? "현장"}
            </Link>
          ) : (
            <Link className="detail-back" href="/">
              ← 대시보드
            </Link>
          )}
        </div>

        <div className="device-detail-title-row">
          <h1>{title}</h1>
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
          {" · "}마지막 수신 {formatLastSeen(device.lastSeenAt)}
        </p>
      </section>

      <section className="device-detail-body">
        <DeviceDetailChartsLazy device={device} />
      </section>

      <section className="device-detail-body">
        <StatusCard device={device} />
      </section>
    </main>
  );
}
