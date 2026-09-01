"use client";

import { useGaugeEnter } from "./useGaugeEnter";

type Props = {
  label: string;
  before?: number | null;
  after?: number | null;
};

const CX = 120;
const CY = 128;
const R_OUT = 94;
const R_MID = 76;
const R_IN = 60;
const SCALE = 100;
const VB = { w: 240, h: 164 };

const COLOR = {
  green: "#22c55e",
  warn: "#eab308",
  danger: "#f87171",
  track: "rgba(255,255,255,0.08)",
  trackInner: "rgba(255,255,255,0.05)",
  edge: "rgba(255,255,255,0.55)",
  tick: "rgba(255,255,255,0.28)",
  text: "rgba(255,255,255,0.72)",
};

function finite(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function toT(v: number): number {
  return Math.min(1, Math.max(0, Math.abs(v) / SCALE));
}

function polar(t: number, r: number) {
  const rad = ((180 - t * 180) * Math.PI) / 180;
  return {
    x: CX + r * Math.cos(rad),
    y: CY - r * Math.sin(rad),
  };
}

/** 반원 홈을 부채꼴로 채움. 끝은 둥근 캡이 아니라 반지름 방향 절단면. */
function sector(t0: number, t1: number, rOuter: number, rInner: number) {
  const span = Math.max(0, Math.min(1, t1) - Math.max(0, t0));
  if (span < 0.0008) return "";
  const a0 = Math.max(0, t0);
  const a1 = Math.min(1, t1);
  const o0 = polar(a0, rOuter);
  const o1 = polar(a1, rOuter);
  const i1 = polar(a1, rInner);
  const i0 = polar(a0, rInner);
  const large = a1 - a0 > 0.5 ? 1 : 0;
  return `M ${o0.x} ${o0.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y} Z`;
}

function radial(t: number, r0: number, r1: number) {
  const a = polar(t, r0);
  const b = polar(t, r1);
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

function fillColor(v: number): string {
  if (v < 20) return COLOR.green;
  if (v < 30) return COLOR.warn;
  return COLOR.danger;
}

function fmt(v: number) {
  return `${v.toFixed(1)}%`;
}

export default function ThdArcGauge({ label, before, after }: Props) {
  const b = finite(before);
  const a = finite(after);
  const enter = useGaugeEnter(950, 80);

  if (b == null && a == null) {
    return (
      <article className="ring-gauge thd-arc-gauge ring-gauge--empty">
        <span className="ring-gauge-title">{label}</span>
        <p className="ring-gauge-muted">데이터 없음</p>
      </article>
    );
  }

  const afterVal = a ?? b ?? 0;
  const beforeVal = b ?? a ?? 0;
  const tA = toT(afterVal) * enter;
  const tB = toT(beforeVal) * enter;
  const afterColor = fillColor(afterVal);
  const beforeColor = fillColor(beforeVal);
  const left = polar(0, R_OUT);
  const right = polar(1, R_OUT);
  const leftIn = polar(0, R_IN);
  const rightIn = polar(1, R_IN);

  return (
    <article className="ring-gauge thd-arc-gauge">
      <span className="ring-gauge-title">{label}</span>
      <div className="thd-arc-plot">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          role="img"
          aria-label={`${label} 전 ${b != null ? fmt(b) : "없음"}, 후 ${a != null ? fmt(a) : "없음"}`}
        >
          <path d={sector(0, 1, R_OUT, R_MID)} fill={COLOR.track} />
          <path d={sector(0, 1, R_MID - 3, R_IN)} fill={COLOR.trackInner} />

          {tB > 0.002 ? (
            <path d={sector(0, tB, R_MID - 3, R_IN)} fill={beforeColor} opacity="0.78" />
          ) : null}
          {tA > 0.002 ? <path d={sector(0, tA, R_OUT, R_MID)} fill={afterColor} /> : null}

          {([0, 20, 50, 100] as const).map((tick) => {
            const t = tick / SCALE;
            return (
              <path
                key={`tick-${tick}`}
                d={radial(t, R_IN - 2, R_OUT + 3)}
                stroke={COLOR.tick}
                strokeWidth={tick === 0 || tick === 100 ? 1.6 : 1}
              />
            );
          })}

          {tB > 0.002 ? (
            <path
              d={radial(tB, R_IN, R_MID - 3)}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="2"
            />
          ) : null}
          {tA > 0.002 ? (
            <path d={radial(tA, R_MID, R_OUT)} stroke="#f8fafc" strokeWidth="2.4" />
          ) : null}

          <path
            d={`M ${leftIn.x} ${leftIn.y} L ${left.x} ${left.y}`}
            stroke={COLOR.edge}
            strokeWidth="2"
          />
          <path
            d={`M ${rightIn.x} ${rightIn.y} L ${right.x} ${right.y}`}
            stroke={COLOR.edge}
            strokeWidth="2"
          />

          {([0, 20, 50, 100] as const).map((tick) => {
            const t = tick / SCALE;
            const p = polar(t, R_OUT + 14);
            return (
              <text
                key={`lab-${tick}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={COLOR.text}
                fontSize="10"
                fontWeight="600"
              >
                {tick}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="ring-gauge-values">
        <span className="ring-gauge-before" style={{ color: beforeColor }}>
          {b != null ? fmt(b) : "—"}
        </span>
        <span className="ring-gauge-arrow">→</span>
        <span className="ring-gauge-after" style={{ color: afterColor }}>
          {a != null ? fmt(a) : "—"}
        </span>
      </div>
    </article>
  );
}
