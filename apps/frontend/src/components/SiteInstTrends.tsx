"use client";

import InstallationSparkline from "./InstallationSparkline";

export default function SiteInstTrends({
  installationId,
}: {
  installationId: string;
}) {
  return (
    <div className="site-inst-trends">
      <div className="summary-inst-sparkline">
        <span className="sit-label">THD 1h</span>
        <InstallationSparkline installationId={installationId} hours={1} metric="thd" />
      </div>
      <div className="summary-inst-sparkline">
        <span className="sit-label">TPF 1h</span>
        <InstallationSparkline
          installationId={installationId}
          hours={1}
          metric="pf"
        />
      </div>
    </div>
  );
}
