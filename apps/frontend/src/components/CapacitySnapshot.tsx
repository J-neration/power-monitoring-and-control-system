import type { Device } from "../types/site";
import ChartCard from "./charts/ChartCard";

const REC_OP_PCT = 70;

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

function roundPct(v: number): number {
  return Math.round(v * 10) / 10;
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
  const headroom =
    device.availableMargin != null
      ? roundPct(device.availableMargin)
      : totalCap != null && opCap != null
        ? roundPct(totalCap - opCap)
        : null;
  const isShort = headroom != null && headroom < 0;
  const headroomAbs = headroom != null ? Math.abs(headroom) : null;
  const opPct = totalCap != null ? pctOf(opCap, totalCap) : null;
  const overRecommend = opPct != null && opPct >= REC_OP_PCT;
  const fillTone = isShort ? "short" : headroom != null ? "head" : "neutral";

  const tooltip = [
    opCap != null ? `운전용량 ${fmtCap(opCap)} ${capUnit}` : null,
    headroom != null
      ? `${isShort ? "부족" : "여유"} ${fmtCap(headroomAbs ?? 0)} ${capUnit}`
      : null,
    `설비용량 ${fmtCap(totalCap ?? 0)} ${capUnit}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ChartCard
      title={`용량 현황 (${capUnit})`}
      subtitle="— 운전용량 70% 미만 권장"
      wide={wide}
      fill={fill}
    >
      {capOk && totalCap != null && totalCap > 0 ? (
        <div className="cap-tank">
          <div className="cap-tank-track" title={tooltip}>
            <div
              className="cap-tank-recommend-zone"
              style={{ left: `${REC_OP_PCT}%` }}
            />
            <div
              className="cap-tank-recommend-mark"
              style={{ left: `${REC_OP_PCT}%` }}
            />
            {opPct != null ? (
              <div
                className={`cap-tank-fill cap-tank-fill--${fillTone}`}
                style={{ width: `${Math.max(opPct, 2)}%` }}
              />
            ) : null}
          </div>
          <div className="cap-tank-axis">
            <span>0</span>
            <span
              className="cap-tank-axis-rec"
              style={{ left: `${REC_OP_PCT}%` }}
            >
              권장 {REC_OP_PCT}%
            </span>
            <span>
              설비 {fmtCap(totalCap)} {capUnit}
            </span>
          </div>

          <div className="cap-readout">
            <div
              className={`cap-readout-item cap-readout-item--op cap-readout-item--${fillTone}`}
            >
              <span className="cap-readout-label">운전용량</span>
              <span className="cap-readout-val">
                {opCap != null ? `${fmtCap(opCap)} ${capUnit}` : "—"}
              </span>
              {opPct != null ? (
                <span
                  className={`cap-readout-hint${overRecommend ? " cap-readout-hint--warn" : ""}`}
                >
                  {roundPct(opPct)}% 
                </span>
              ) : null}
            </div>
            <div
              className={`cap-readout-item cap-readout-item--${isShort ? "short" : "head"}`}
            >
              <span className="cap-readout-label">
                {headroom == null
                  ? "여유용량"
                  : isShort
                    ? "부족용량"
                    : "여유용량"}
              </span>
              <span className="cap-readout-val">
                {headroomAbs != null
                  ? `${fmtCap(headroomAbs)} ${capUnit}`
                  : "—"}
              </span>
              {headroomAbs != null && totalCap != null && totalCap > 0 ? (
                <span
                  className={`cap-readout-hint${isShort ? " cap-readout-hint--warn" : ""}`}
                >
                  {isShort
                    ? `설비용량 대비 ${roundPct((headroomAbs / totalCap) * 100)}% 초과`
                    : `설비용량 대비 ${roundPct((headroomAbs / totalCap) * 100)}%`}
                </span>
              ) : null}
            </div>
            <div className="cap-readout-item cap-readout-item--total">
              <span className="cap-readout-label">설비용량</span>
              <span className="cap-readout-val">
                {fmtCap(totalCap)} {capUnit}
              </span>
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
