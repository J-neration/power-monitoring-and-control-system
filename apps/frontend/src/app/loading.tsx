export default function DashboardLoading() {
  return (
    <main className="dashboard-full">
      <div className="new-dashboard">
        {/* Header skeleton */}
        <header className="dash-header">
          <div className="dash-logo">
            <span className="dash-logo-mark">▣</span>
            <span className="dash-logo-text">PRIMESOLUTION</span>
          </div>
          <div className="dash-kpis">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="kpi-badge">
                <span className="skel skel-text" style={{ width: 20 }} />
                <span className="skel skel-text" style={{ width: 32 }} />
              </div>
            ))}
          </div>
          <div className="skel skel-text" style={{ width: 100 }} />
        </header>

        {/* Body skeleton */}
        <div className="dash-body">
          {/* Sidebar */}
          <aside className="dash-sidebar">
            <p className="sidebar-title">설치 현황</p>
            <div className="sidebar-list" style={{ padding: "8px 16px", gap: 12, display: "flex", flexDirection: "column" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="skel skel-circle" />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="skel skel-text" style={{ width: "80%" }} />
                    <div className="skel skel-text" style={{ width: "50%" }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Map */}
          <div className="dash-map-panel">
            <div className="skel skel-box" style={{ width: "100%", height: "100%", borderRadius: 12 }} />
          </div>

          {/* Right panel */}
          <div className="dash-detail">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="skel skel-circle" style={{ width: 10, height: 10 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="skel skel-text" style={{ width: "60%" }} />
                <div className="skel skel-text" style={{ width: "90%" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skel skel-box" style={{ height: 52, borderRadius: 8 }} />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skel skel-box" style={{ height: 80, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
