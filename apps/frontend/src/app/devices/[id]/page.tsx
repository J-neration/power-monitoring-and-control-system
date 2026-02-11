import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDevice } from "../../../lib/api";
import { StatusCard } from "../../../components/StatusCard";
import type { DeviceWithInstallation } from "../../../types/site";

type Props = {
  params: { id: string };
};

export default async function DeviceDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const device = (await fetchDevice(id)) as DeviceWithInstallation | null;

  if (!device) notFound();

  const site = device.installation?.site;
  const title = `${site?.name ?? "Site"} / ${device.installation?.label ?? "Installation"}`;

  return (
    <main>
      <section className="panel detail-header">
        <div>
          <Link className="detail-back" href="/">
            ← 대시보드
          </Link>

          <h1>{title}</h1>

          <p className="detail-subtitle">
            {site?.region ?? "-"} {site?.address ?? ""}
          </p>

          <p className="detail-subtitle">
            Installation ID: {device.installationId}
            {device.installation?.capacity != null ? ` · ${device.installation.capacity} kVAR` : ""}
          </p>
        </div>
      </section>

      <section className="panel detail-content">
        <StatusCard device={device} />
      </section>
    </main>
  );
}
