"use client";

import { useGaugeEnter } from "./useGaugeEnter";

type Qty = "tpf" | "dpf";

type Props = {
  label: string;
  before?: number | null;
  after?: number | null;
  /** PF 탭 라벨용. 눈금/띠 색은 바꾸지 않는다. */
  qty?: Qty;
};

const CX = 120;
const CY = 128;
const R = 92;
const STROKE = 11;
const MIN_MAG = 50;
const GREEN = 90;
const YELLOW = 80;
const VB = { w: 240, h: 168 };

const COLOR = {
  orange: "#c47a38",
  yellow: "#d4b44a",
  green: "#3cba7c",
  track: "rgba(255,255,255,0.06)",
  bezel: "rgba(255,255,255,0.12)",
  tick: "rgba(255,255,255,0.28)",
  tickMajor: "rgba(255,255,255,0.5)",
  before: "#cbd5e1",
  after: "#2dd4bf",
  text: "rgba(226, 232, 240, 0.72)",
  muted: "rgba(148, 163, 184, 0.55)",
  hub: "#0d1218",
};

function finite(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

/** 왼쪽 Lead → 꼭대기 100% → 오른쪽 Lag. 음수 = Lead. */
function pfToT(pf: number): number {
  const mag = Math.abs(pf);
  const clamped = Math.max(MIN_MAG, Math.min(100, mag));
  const fromUnity = (100 - clamped) / (100 - MIN_MAG);
  return pf < 0 ? 0.5 - fromUnity * 0.5 : 0.5 + fromUnity * 0.5;
}

function polar(t: number, r = R) {
  const rad = ((180 - t * 180) * Math.PI) / 180;
  return {
    x: CX + r * Math.cos(rad),
    y: CY - r * Math.sin(rad),
  };
}

function arcPath(t0: number, t1: number, r = R) {
  const a = polar(t0, r);
  const b = polar(t1, r);
  const large = t1 - t0 > 0.5 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

function tickLine(t: number, inner: number, outer: number) {
  const a = polar(t, inner);
  const b = polar(t, outer);
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

function arrowPoints(t: number, length: number, halfW: number) {
  const tip = polar(t, length);
  const rad = ((180 - t * 180) * Math.PI) / 180;
  const nx = Math.sin(rad);
  const ny = Math.cos(rad);
  const base = polar(t, 14);
  return `${tip.x},${tip.y} ${base.x + nx * halfW},${base.y + ny * halfW} ${base.x - nx * halfW},${base.y - ny * halfW}`;
}

function fmt(v: number) {
  return `${v.toFixed(1)}%`;
}

const BANDS = [
  { t0: 0, t1: pfToT(-YELLOW), color: COLOR.orange },
  { t0: pfToT(-YELLOW), t1: pfToT(-GREEN), color: COLOR.yellow },
  { t0: pfToT(-GREEN), t1: pfToT(GREEN), color: COLOR.green },
  { t0: pfToT(GREEN), t1: pfToT(YELLOW), color: COLOR.yellow },
  { t0: pfToT(YELLOW), t1: 1, color: COLOR.orange },
] as const;

const LABELS = [
  { t: pfToT(-GREEN), text: "−90" },
  { t: 0.5, text: "100" },
  { t: pfToT(GREEN), text: "90" },
] as const;

const TICKS = [50, 60, 70, 80, 90, 100] as const;

function QtyPills({ qty }: { qty: Qty }) {
  if (qty === "dpf") {
    return (
      <span className="pf-needle-qty">
        <span className="pf-qty-pill pf-qty-pill--q">Q</span>
      </span>
    );
  }
  return (
    <span className="pf-needle-qty">
      <span className="pf-qty-pill pf-qty-pill--q">Q</span>
      <span className="pf-qty-plus">+</span>
      <span className="pf-qty-pill pf-qty-pill--h">H</span>
    </span>
  );
}

export default function PfNeedleGauge({ label, before, after, qty }: Props) {
  const b = finite(before);
  const a = finite(after);
  const enter = useGaugeEnter(900, 40);

  if (b == null && a == null) {
    return (
      <article className="ring-gauge pf-needle-gauge pf-needle-gauge--empty">
        <span className="ring-gauge-title">{label}</span>
        {qty ? <QtyPills qty={qty} /> : null}
        <p className="ring-gauge-muted">데이터 없음</p>
      </article>
    );
  }

  const tB = b != null ? pfToT(b) * enter : null;
  const tA = a != null ? pfToT(a) * enter : null;
  const tipB = tB != null ? polar(tB, R - STROKE - 8) : null;

  return (
    <article className="ring-gauge pf-needle-gauge">
      <div className="pf-needle-head">
        <span className="ring-gauge-title">{label}</span>
        {qty ? <QtyPills qty={qty} /> : null}
      </div>
      <div className="pf-needle-plot">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          role="img"
          aria-label={`${label} 전 ${b != null ? fmt(b) : "없음"}, 후 ${a != null ? fmt(a) : "없음"}`}
        >
          <path
            d={arcPath(0, 1)}
            fill="none"
            stroke={COLOR.bezel}
            strokeWidth={STROKE + 5}
            strokeLinecap="round"
          />
          <path
            d={arcPath(0, 1)}
            fill="none"
            stroke={COLOR.track}
            strokeWidth={STROKE + 2}
            strokeLinecap="round"
          />
          {BANDS.map((band) => (
            <path
              key={`${band.t0}-${band.t1}`}
              d={arcPath(band.t0, band.t1)}
              fill="none"
              stroke={band.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          ))}

          {TICKS.flatMap((mag) => {
            const sides = mag === 100 ? [100] : [-mag, mag];
            return sides.map((pf) => {
              const t = pfToT(pf);
              const major = mag === 80 || mag === 90 || mag === 100;
              return (
                <path
                  key={`${pf}`}
                  d={tickLine(t, R - STROKE / 2 - 1, R + STROKE / 2 + (major ? 3 : 1))}
                  fill="none"
                  stroke={major ? COLOR.tickMajor : COLOR.tick}
                  strokeWidth={major ? 1.2 : 0.8}
                  strokeLinecap="round"
                />
              );
            });
          })}

          {LABELS.map((item) => {
            const p = polar(item.t, R + 20);
            return (
              <text
                key={`${item.text}-${item.t}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={COLOR.text}
                fontSize={item.text === "100" ? 11 : 9}
                fontWeight="600"
              >
                {item.text}
              </text>
            );
          })}

          <text
            x={polar(0.04, R - 20).x}
            y={CY + 16}
            textAnchor="start"
            fill={COLOR.muted}
            fontSize="9"
            fontWeight="600"
            letterSpacing="0.14em"
          >
            LEAD
          </text>
          <text
            x={polar(0.96, R - 20).x}
            y={CY + 16}
            textAnchor="end"
            fill={COLOR.muted}
            fontSize="9"
            fontWeight="600"
            letterSpacing="0.14em"
          >
            LAG
          </text>

          {tipB && tB != null ? (
            <g>
              <line
                x1={CX}
                y1={CY}
                x2={tipB.x}
                y2={tipB.y}
                stroke={COLOR.before}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="3.5 2.8"
              />
              <circle
                cx={tipB.x}
                cy={tipB.y}
                r="3.4"
                fill="none"
                stroke={COLOR.before}
                strokeWidth="1.6"
              />
            </g>
          ) : null}

          {tA != null ? (
            <polygon
              points={arrowPoints(tA, R - STROKE - 1, 5)}
              fill={COLOR.after}
            />
          ) : null}

          <circle cx={CX} cy={CY} r="8" fill={COLOR.hub} stroke={COLOR.before} strokeWidth="1.2" />
          <circle cx={CX} cy={CY} r="3.4" fill={COLOR.after} />
        </svg>
      </div>
      <div className="pf-needle-legend" aria-hidden>
        <span className="pf-needle-leg pf-needle-leg--before">전</span>
        <span className="pf-needle-leg pf-needle-leg--after">후</span>
      </div>
      <div className="ring-gauge-values">
        <span className="ring-gauge-before">{b != null ? fmt(b) : "—"}</span>
        <span className="ring-gauge-arrow">→</span>
        <span className="ring-gauge-after" style={{ color: COLOR.after }}>
          {a != null ? fmt(a) : "—"}
        </span>
      </div>
    </article>
  );
}
