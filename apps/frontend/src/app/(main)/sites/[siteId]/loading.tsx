import Link from "next/link";

export default function SiteLoading() {
  return (
    <main className="site-page">
      {/* Header skeleton */}
      <header className="site-header">
        <div className="site-header-left">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              className="skel skel-circle"
              style={{ width: 10, height: 10 }}
            />
            <div
              className="skel skel-text"
              style={{ width: 180, height: 22 }}
            />
            <div
              className="skel skel-box"
              style={{ width: 72, height: 22, borderRadius: 4 }}
            />
          </div>
          <div className="skel skel-text" style={{ width: 280 }} />
          <div className="skel skel-text" style={{ width: 120 }} />
        </div>
        <div className="site-stats-row">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="skel skel-box"
              style={{ width: 72, height: 56, borderRadius: 8 }}
            />
          ))}
        </div>
      </header>

      {/* Card grid skeleton */}
      <section className="site-card-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skel skel-box"
            style={{ height: 180, borderRadius: 12 }}
          />
        ))}
      </section>
    </main>
  );
}
