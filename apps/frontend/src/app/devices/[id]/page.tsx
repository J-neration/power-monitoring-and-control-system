import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDevice } from "../../../lib/api";
import { StatusCard } from "../../../components/StatusCard";

type DeviceDetailPageProps = {
  params: { id: string };
};

export default async function DeviceDetailPage({
  params,
}: DeviceDetailPageProps) {
  const device = await fetchDevice(params.id);
  if (!device) {
    notFound();
  }

  return (
    <main>
      <section className="panel detail-header">
        <div>
          <Link className="detail-back" href="/">
            ← 목록으로
          </Link>
          <h1>{device.name}</h1>
          <p className="detail-subtitle">{device.location}</p>
          <p className="detail-subtitle">Device ID: {device.id}</p>
        </div>
      </section>
      <section className="panel detail-content">
        <StatusCard device={device} />
      </section>
    </main>
  );
}
