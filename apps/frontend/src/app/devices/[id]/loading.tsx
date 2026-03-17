import Link from "next/link";

export default function DeviceLoading() {
  return (
    <main className="device-detail-page">
      {/* Header skeleton */}
      <section className="device-detail-header panel">
        <div className="device-detail-nav">
          <Link className="detail-back" href="/">← 뒤로</Link>
        </div>
        <div className="device-detail-title-row">
          <div className="skel skel-text" style={{ width: 240, height: 24 }} />
          <div className="skel skel-box" style={{ width: 72, height: 24, borderRadius: 4 }} />
        </div>
        <div className="skel skel-text" style={{ width: 300 }} />
        <div className="skel skel-text" style={{ width: 220 }} />
      </section>

      {/* Charts skeleton */}
      <section className="device-detail-body">
        <div className="device-charts-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skel skel-box" style={{ height: 200, borderRadius: 10 }} />
          ))}
        </div>
      </section>

      {/* Table skeleton */}
      <section className="device-detail-body">
        <div className="skel skel-box" style={{ height: 320, borderRadius: 10 }} />
      </section>
    </main>
  );
}
