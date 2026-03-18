import Link from "next/link";
import { fetchSites } from "../../../../lib/api";
import type { Device, DeviceStatus } from "../../../../types/site";
import { CLIENT_LABELS } from "../../../../data/clients";

type Props = {
  params: { siteId: string };
};

const statusPriority: Record<DeviceStatus, number> = {
  fault: 4,
  offline: 3,
  start: 2,
  standby: 2,
  running: 1,
};

const STATUS_LABEL: Record<DeviceStatus, string> = {
  running: "RUNNING",
  standby: "STANDBY",
  start: "START",
  fault: "FAULT",
  offline: "OFFLINE",
};

function deriveSiteStatus(installations: { device: Device }[]): DeviceStatus {
  let worst: DeviceStatus = "running";
  for (const inst of installations) {
    const s = inst.device?.status ?? "offline";
    if (statusPriority[s] > statusPriority[worst]) worst = s;
  }
  return worst;
}

function countStatuses(installations: { device: Device }[]) {
  let running = 0,
    standby = 0,
    fault = 0,
    offline = 0;
  for (const inst of installations) {
    const s = inst.device?.status ?? "offline";
    if (s === "running") running++;
    else if (s === "fault") fault++;
    else if (s === "standby" || s === "start") standby++;
    else offline++;
  }
  return { total: installations.length, running, standby, fault, offline };
}

function formatLastSeen(installations: { device: { lastSeenAt: string } }[]) {
  const latest = installations
    .map((x) => Date.parse(x.device.lastSeenAt))
    .filter((v) => Number.isFinite(v))
    .reduce((max, v) => (v > max ? v : max), 0);
  if (!latest) return "-";
  const diff = Date.now() - latest;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

export default async function SitePage({ params }: Props) {
  const sites = await fetchSites();
  const siteId = decodeURIComponent(params.siteId);
  const site = sites.find((s) => s.id === siteId);

  if (!site) {
    return (
      <main className="site-page">
        <div className="site-empty">
          <h1>현장을 찾을 수 없습니다</h1>
          <p>{siteId}</p>
        </div>
      </main>
    );
  }

  const siteStatus = deriveSiteStatus(site.installations);
  const stats = countStatuses(site.installations);

  return (
    <main className="site-page">
      {/* Header */}
      <header className="site-header">
        <div className="site-header-left">
          <div className="site-header-title">
            <div className={`detail-status-dot ${siteStatus}`} />
            <h1>{site.name}</h1>
            <span className={`detail-status-badge ${siteStatus}`}>
              {STATUS_LABEL[siteStatus]}
            </span>
          </div>
          <p className="site-header-meta">
            {CLIENT_LABELS[site.client] ?? site.client} · {site.region} ·{" "}
            {site.address}
          </p>
          <p className="site-header-meta">
            마지막 수신 {formatLastSeen(site.installations)}
          </p>
        </div>

        <div className="site-stats-row">
          <div className="site-stat">
            <span className="site-stat-val">{stats.total}</span>
            <span className="site-stat-lbl">설치지점</span>
          </div>
          <div className="site-stat site-stat-ok">
            <span className="site-stat-val">{stats.running}</span>
            <span className="site-stat-lbl">정상</span>
          </div>
          <div className="site-stat site-stat-warn">
            <span className="site-stat-val">{stats.standby}</span>
            <span className="site-stat-lbl">대기</span>
          </div>
          <div className="site-stat site-stat-err">
            <span className="site-stat-val">{stats.fault + stats.offline}</span>
            <span className="site-stat-lbl">이상</span>
          </div>
        </div>
      </header>

      {/* Installation cards */}
      <section className="site-card-grid">
        {site.installations.map((inst) => {
          const d = inst.device;
          const instStatus = (d?.status as DeviceStatus) ?? "offline";
          const allModList = d?.moduleStatus ?? [];
          const numOfMods = d?.numOfMods;
          const slicedModList =
            numOfMods != null && numOfMods > 0 && numOfMods <= allModList.length
              ? allModList.slice(0, numOfMods)
              : allModList;
          // MOD_OFFLINE(4) = 미설치 슬롯 → 제외
          const modList = slicedModList.filter((m) => m !== 4);
          const modOk = modList.filter((m) => m === 2).length;

          return (
            <Link
              key={inst.id}
              href={`/devices/${encodeURIComponent(inst.id)}`}
              className="site-inst-card"
            >
              <div className="site-inst-top">
                <div className={`site-inst-dot ${instStatus}`} />
                <span className="site-inst-label">{inst.label}</span>
                <span className={`detail-status-badge ${instStatus}`}>
                  {STATUS_LABEL[instStatus]}
                </span>
              </div>

              <div className="site-inst-meta-row">
                {d?.model && (
                  <span className="device-model-badge">
                    {d.model.toUpperCase()}
                  </span>
                )}
                {d?.capacity != null && (
                  <span className="device-capacity-badge">
                    {d.capacity} {d.model === "paf" ? "A" : "kVAR"}
                  </span>
                )}
              </div>

              <div className="site-inst-divider" />

              <div className="site-inst-table">
                <div className="sit-row">
                  <span className="sit-label">V (V)</span>
                  <span>{d?.vL1 != null ? d.vL1.toFixed(1) : "-"}</span>
                  <span>{d?.vL2 != null ? d.vL2.toFixed(1) : "-"}</span>
                  <span>{d?.vL3 != null ? d.vL3.toFixed(1) : "-"}</span>
                </div>
                <div className="sit-row">
                  <span className="sit-label">Grid I (A)</span>
                  <span>
                    {d?.gridCurrentL1 != null
                      ? d.gridCurrentL1.toFixed(1)
                      : "-"}
                  </span>
                  <span>
                    {d?.gridCurrentL2 != null
                      ? d.gridCurrentL2.toFixed(1)
                      : "-"}
                  </span>
                  <span>
                    {d?.gridCurrentL3 != null
                      ? d.gridCurrentL3.toFixed(1)
                      : "-"}
                  </span>
                </div>
                <div className="sit-row">
                  <span className="sit-label">Grid THD (%)</span>
                  <span>
                    {d?.gridCurrentTHDL1 != null
                      ? d.gridCurrentTHDL1.toFixed(1)
                      : "-"}
                  </span>
                  <span>
                    {d?.gridCurrentTHDL2 != null
                      ? d.gridCurrentTHDL2.toFixed(1)
                      : "-"}
                  </span>
                  <span>
                    {d?.gridCurrentTHDL3 != null
                      ? d.gridCurrentTHDL3.toFixed(1)
                      : "-"}
                  </span>
                </div>
                <div className="sit-row sit-row-pf">
                  <span className="sit-label">Grid TPF / DPF</span>
                  <span>
                    {d?.tpf2 != null ? `${(d.tpf2 * 100).toFixed(1)}%` : "-"}
                  </span>
                  <span>
                    {d?.dpf2 != null ? `${(d.dpf2 * 100).toFixed(1)}%` : "-"}
                  </span>
                  <span />
                </div>
              </div>

              {modList.length > 0 && (
                <div className="site-inst-mods">
                  <span className="site-inst-mods-label">
                    보상중인 모듈 {modOk}/{modList.length}
                  </span>
                  <div className="site-inst-mods-bar">
                    <div
                      className="site-inst-mods-fill"
                      style={{
                        width: `${modList.length > 0 ? (modOk / modList.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </section>
    </main>
  );
}
