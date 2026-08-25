import type { Device } from "../types/site";
import { CHART_COLORS } from "../lib/chartTheme";
import ChartCard from "./charts/ChartCard";

function hasCapTelemetry(d: Device): boolean {
  return (
    d.totalCapacity != null ||
    d.operatingCapacity != null ||
    d.reactivePowerCapacity != null ||
    d.availableMargin != null
  );
}

function fmtCap(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function CapacitySnapshot({
  device,
  fill = false,
  wide = false,
}: {
  device: Device;
  fill?: boolean;
  wide?: boolean;
}) {
  const capUnit = device.model === "paf" ? "A" : "kvar";
  const capOk = hasCapTelemetry(device);
  const totalCap = device.totalCapacity ?? device.capacity ?? null;
  const opCap = device.operatingCapacity ?? null;
  const rpCap = device.reactivePowerCapacity ?? null;
  const margin =
    device.availableMargin ??
    (totalCap != null && opCap != null ? totalCap - opCap : null);
  const idleCap =
    opCap != null && rpCap != null ? Math.max(0, opCap - rpCap) : null;
  const rpPct =
    capOk && totalCap != null && totalCap > 0 && rpCap != null
      ? (rpCap / totalCap) * 100
      : 0;
  const idlePct =
    capOk && totalCap != null && totalCap > 0 && idleCap != null
      ? (idleCap / totalCap) * 100
      : 0;
  const marginPct =
    capOk && totalCap != null && totalCap > 0 && margin != null
      ? (margin / totalCap) * 100
      : 0;

  return (
    <ChartCard
      title={`용량 현황 (${capUnit})`}
      subtitle={
        capOk && totalCap != null
          ? `— 총용량 ${totalCap} ${capUnit}`
          : undefined
      }
      wide={wide}
      fill={fill}
    >
      {capOk && totalCap != null ? (
        <>
          <div className="cap-snapshot-bar-wrap">
            <div className="cap-snapshot-bar">
              {rpPct > 0 && rpCap != null && (
                <div
                  className="cap-seg-bar cap-reactive"
                  style={{ width: `${rpPct}%` }}
                  title={`무효전력 발생: ${rpCap} ${capUnit}`}
                />
              )}
              {idlePct > 0 && idleCap != null && (
                <div
                  className="cap-seg-bar cap-idle"
                  style={{ width: `${idlePct}%` }}
                  title={`운전 여유: ${idleCap.toFixed(1)} ${capUnit}`}
                />
              )}
              {marginPct > 0 && margin != null && (
                <div
                  className="cap-seg-bar cap-margin"
                  style={{ width: `${marginPct}%` }}
                  title={`여유 마진: ${margin} ${capUnit}`}
                />
              )}
            </div>
            <div className="cap-snapshot-pct">
              {(rpPct + idlePct).toFixed(1)}% 가동
            </div>
          </div>
          <div className="cap-snapshot-stats">
            <div className="cap-stat">
              <span
                className="cap-stat-dot"
                style={{ background: CHART_COLORS.accent }}
              />
              <span className="cap-stat-label">무효전력 발생</span>
              <span className="cap-stat-val">
                {rpCap != null ? `${rpCap} ${capUnit}` : "—"}
              </span>
            </div>
            <div className="cap-stat">
              <span
                className="cap-stat-dot"
                style={{ background: CHART_COLORS.blue }}
              />
              <span className="cap-stat-label">운전 용량</span>
              <span className="cap-stat-val">
                {opCap != null ? `${opCap} ${capUnit}` : "—"}
              </span>
            </div>
            <div className="cap-stat">
              <span
                className="cap-stat-dot"
                style={{ background: CHART_COLORS.gridMuted }}
              />
              <span className="cap-stat-label">여유 마진</span>
              <span className="cap-stat-val">
                {margin != null ? `${fmtCap(margin)} ${capUnit}` : "—"}
              </span>
            </div>
            <div className="cap-stat">
              <span
                className="cap-stat-dot"
                style={{ background: "rgba(255,255,255,0.2)" }}
              />
              <span className="cap-stat-label">총 용량</span>
              <span className="cap-stat-val">
                {totalCap} {capUnit}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="history-empty device-detail-chart-empty">
          <p>데이터 없음</p>
        </div>
      )}
    </ChartCard>
  );
}
