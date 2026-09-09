import type { Device } from "../types/site";
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

function pctOf(value: number | null, max: number): number | null {
  if (value == null || max <= 0) return null;
  return Math.max(0, Math.min(100, (value / max) * 100));
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
  const fillOfOp =
    rpCap != null && opCap != null && opCap > 0
      ? Math.max(0, Math.min(100, Math.round((rpCap / opCap) * 1000) / 10))
      : null;
  const opPct = totalCap != null ? pctOf(opCap, totalCap) : null;
  const atLimit = fillOfOp != null && fillOfOp >= 98.5;
  const showFillLabel = fillOfOp != null && fillOfOp >= 22;

  return (
    <ChartCard title={`용량 현황 (${capUnit})`} wide={wide} fill={fill}>
      {capOk && totalCap != null && totalCap > 0 ? (
        <div className="cap-tank">
          <div
            className="cap-tank-track"
            title={
              rpCap != null && opCap != null
                ? `무효전력 발생 ${fmtCap(rpCap)} ${capUnit} · 운전용량 ${fmtCap(opCap)} ${capUnit}의 ${fillOfOp}%`
                : `총용량 ${fmtCap(totalCap)} ${capUnit}`
            }
          >
            {opPct != null ? (
              <div
                className="cap-tank-shell"
                style={{ width: `${Math.max(opPct, 2)}%` }}
              >
                <div className="cap-tank-well">
                  {fillOfOp != null ? (
                    <div
                      className={`cap-tank-liquid${atLimit ? " cap-tank-liquid--full" : ""}`}
                      style={{ width: `${fillOfOp}%` }}
                    >
                      {showFillLabel ? (
                        <span className="cap-tank-liquid-pct">{fillOfOp}%</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="cap-tank-axis">
            <span>0</span>
            <span>
              총 {fmtCap(totalCap)} {capUnit}
            </span>
          </div>

          <div className="cap-readout">
            <div className="cap-readout-item cap-readout-item--rp">
              <span className="cap-readout-label">무효전력 발생</span>
              <span className="cap-readout-val">
                {rpCap != null ? `${fmtCap(rpCap)} ${capUnit}` : "—"}
              </span>
              {fillOfOp != null ? (
                <span className="cap-readout-hint">
                  운전용량 대비 {fillOfOp}%
                </span>
              ) : null}
            </div>
            <div className="cap-readout-item cap-readout-item--op">
              <span className="cap-readout-label">운전 용량</span>
              <span className="cap-readout-val">
                {opCap != null ? `${fmtCap(opCap)} ${capUnit}` : "—"}
              </span>
            </div>
            <div className="cap-readout-item cap-readout-item--total">
              <span className="cap-readout-label">총 용량</span>
              <span className="cap-readout-val">
                {fmtCap(totalCap)} {capUnit}
              </span>
              {margin != null ? (
                <span className="cap-readout-hint cap-readout-hint--muted">
                  여유 {fmtCap(margin)} {capUnit}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="history-empty device-detail-chart-empty">
          <p>데이터 없음</p>
        </div>
      )}
    </ChartCard>
  );
}
