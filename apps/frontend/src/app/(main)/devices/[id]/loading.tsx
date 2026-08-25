import Link from "next/link";

export default function DeviceLoading() {
  return (
    <main className="device-detail-page">
      <section className="device-detail-header device-detail-header--compact panel">
        <div className="device-detail-nav">
          <Link className="detail-back" href="/">
            ← 뒤로
          </Link>
        </div>
        <div className="device-detail-title-row">
          <div className="skel skel-text" style={{ width: 240, height: 20 }} />
          <div
            className="skel skel-box"
            style={{ width: 72, height: 20, borderRadius: 4 }}
          />
        </div>
      </section>
      <section className="device-detail-body" style={{ flex: 1, minHeight: 0 }}>
        <div className="device-charts-grid device-charts-grid--compact">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="skel skel-box"
              style={{ height: "100%", borderRadius: 10 }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
