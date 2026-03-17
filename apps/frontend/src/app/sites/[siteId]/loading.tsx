import Link from "next/link";

export default function SiteLoading() {
  return (
    <main>
      {/* Top bar skeleton */}
      <section className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link className="detail-back" href="/">← 대시보드</Link>
          <div className="skel skel-text" style={{ width: 180, height: 22 }} />
          <div className="skel skel-text" style={{ width: 240 }} />
          <div className="skel skel-text" style={{ width: 140 }} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skel skel-box" style={{ width: 80, height: 60, borderRadius: 12 }} />
          ))}
        </div>
      </section>

      {/* Card grid skeleton */}
      <section className="dashboard" style={{ marginTop: 24 }}>
        <div className="panel location-panel">
          <div className="device-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skel skel-box" style={{ height: 220, borderRadius: 16 }} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
