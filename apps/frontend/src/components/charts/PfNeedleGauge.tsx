"use client";

import { PF_QTY } from "../../lib/chartTheme";

type Props = {
  label: string;
  before?: number | null;
  after?: number | null;
  kind?: "tpf" | "dpf";
  qBefore?: number | null;
  qAfter?: number | null;
  hBefore?: number | null;
  hAfter?: number | null;
};

const CX = 120;
const CY = 118;
const R = 86;
const MIN_MAG = 50;
const GREEN = 90;
const YELLOW = 80;
const VB = { w: 240, h: 148 };

const COLOR = {
  track: "rgba(255,255,255,0.07)",
  bezel: "rgba(255,255,255,0.12)",
  before: "#94a3b8",
  q: PF_QTY.q,
  h: PF_QTY.h,
  text: "rgba(255,255,255,0.78)",
  muted: "rgba(255,255,255,0.38)",
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

function unityFill(tEnd: number, r: number) {
  const t0 = Math.min(0.5, tEnd);
  const t1 = Math.max(0.5, tEnd);
  if (t1 - t0 < 0.01) return null;
  return arcPath(t0, t1, r);
}

function fmt(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtKvar(v: number | null) {
  return v == null ? "—" : v.toFixed(1);
}

function QtyFormula({ kind }: { kind?: "tpf" | "dpf" }) {
  if (kind === "tpf") {
    return (
      <div className="pf-qty-formula" aria-label="Q + H">
        <span className="pf-qty-pill pf-qty-pill--q">Q</span>
        <span className="pf-qty-plus">+</span>
        <span className="pf-qty-pill pf-qty-pill--h">H</span>
      </div>
    );
  }
  if (kind === "dpf") {
    return (
      <div className="pf-qty-formula" aria-label="Q">
        <span className="pf-qty-pill pf-qty-pill--q">Q</span>
      </div>
    );
  }
  return null;
}

function QtyValues({
  kind,
  qBefore,
  qAfter,
  hBefore,
  hAfter,
}: {
  kind?: "tpf" | "dpf";
  qBefore?: number | null;
  qAfter?: number | null;
  hBefore?: number | null;
  hAfter?: number | null;
}) {
  if (kind !== "tpf" && kind !== "dpf") return null;
  const qB = finite(qBefore);
  const qA = finite(qAfter);
  const hB = finite(hBefore);
  const hA = finite(hAfter);
  const qAbs = Math.abs(qA ?? qB ?? 0);
  const hAbs = kind === "tpf" ? Math.abs(hA ?? hB ?? 0) : 0;
  const total = qAbs + hAbs;
  return (
    <div className="pf-qty-block">
      {total > 0 ? (
        <div className="pf-qty-bar" aria-hidden>
          {qAbs > 0 ? (
            <span
              className="pf-qty-seg pf-qty-seg--q"
              style={{ flexGrow: qAbs, flexBasis: 0 }}
            />
          ) : null}
          {hAbs > 0 ? (
            <span
              className="pf-qty-seg pf-qty-seg--h"
              style={{ flexGrow: hAbs, flexBasis: 0 }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="pf-qty-lines">
        <div className="pf-qty-line">
          <span className="pf-qty-pill pf-qty-pill--q">Q</span>
          <span className="pf-qty-pair">
            {fmtKvar(qB)}
            <span className="pf-qty-arrow">→</span>
            {fmtKvar(qA)}
          </span>
        </div>
        {kind === "tpf" ? (
          <div className="pf-qty-line">
            <span className="pf-qty-pill pf-qty-pill--h">H</span>
            <span className="pf-qty-pair">
              {fmtKvar(hB)}
              <span className="pf-qty-arrow">→</span>
              {fmtKvar(hA)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function sideOf(v: number) {
  if (Math.abs(v) >= 99.5) return "100";
  return v < 0 ? "LEAD" : "LAG";
}

function RimMarker({
  t,
  fill,
  radius,
  r,
}: {
  t: number;
  fill: string;
  radius: number;
  r: number;
}) {
  const p = polar(t, r);
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={radius + 3} fill="#07090e" />
      <circle
        cx={p.x}
        cy={p.y}
        r={radius}
        fill={fill}
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="2"
      />
    </g>
  );
}

export default function PfNeedleGauge({
  label,
  before,
  after,
  kind,
  qBefore,
  qAfter,
  hBefore,
  hAfter,
}: Props) {
  const b = finite(before);
  const a = finite(after);

  if (b == null && a == null) {
    return (
      <article
        className={`ring-gauge pf-needle-gauge pf-needle-gauge--empty${kind ? ` pf-compare-gauge--${kind}` : ""}`}
      >
        <div className="pf-compare-head">
          <span className="ring-gauge-title">{label}</span>
          <QtyFormula kind={kind} />
        </div>
        <p className="ring-gauge-muted">데이터 없음</p>
      </article>
    );
  }

  const tB = b != null ? pfToT(b) : null;
  const tA = a != null ? pfToT(a) : null;
  const overlap =
    tB != null && tA != null && Math.abs(tA - tB) < 0.035;
  const deltaMag =
    b != null && a != null ? Math.abs(a) - Math.abs(b) : null;
  const deltaLabel =
    deltaMag == null
      ? null
      : `${deltaMag >= 0 ? "+" : ""}${deltaMag.toFixed(1)}%p`;

  const showH = kind === "tpf";
  const rQ = showH ? R - 8 : R;
  const rH = R + 8;
  const sw = showH ? 11 : 16;
  const qFill = tA != null ? unityFill(tA, rQ) : null;
  const hFill = showH && tA != null ? unityFill(tA, rH) : null;
  const beforeFill = tB != null ? unityFill(tB, showH ? R : R) : null;

  return (
    <article
      className={`ring-gauge pf-needle-gauge pf-compare-gauge${kind ? ` pf-compare-gauge--${kind}` : ""}`}
    >
      <div className="pf-compare-head">
        <span className="ring-gauge-title">{label}</span>
        <QtyFormula kind={kind} />
      </div>
      <div className="pf-needle-plot">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          role="img"
          aria-label={`${label} 보상 전 ${b != null ? fmt(b) : "없음"}, 보상 후 ${a != null ? fmt(a) : "없음"}`}
        >
          <path
            d={arcPath(0, 1, rQ)}
            fill="none"
            stroke={COLOR.bezel}
            strokeWidth={sw + 5}
            strokeLinecap="butt"
          />
          <path
            d={arcPath(0, 1, rQ)}
            fill="none"
            stroke={COLOR.track}
            strokeWidth={sw + 2}
            strokeLinecap="butt"
          />
          {showH ? (
            <>
              <path
                d={arcPath(0, 1, rH)}
                fill="none"
                stroke={COLOR.bezel}
                strokeWidth={sw + 5}
                strokeLinecap="butt"
              />
              <path
                d={arcPath(0, 1, rH)}
                fill="none"
                stroke={COLOR.track}
                strokeWidth={sw + 2}
                strokeLinecap="butt"
              />
            </>
          ) : null}

          {beforeFill ? (
            <path
              d={beforeFill}
              fill="none"
              stroke={COLOR.before}
              strokeWidth={sw - 2}
              strokeLinecap="round"
              opacity="0.35"
            />
          ) : null}
          {qFill ? (
            <path
              d={qFill}
              fill="none"
              stroke={COLOR.q}
              strokeWidth={sw}
              strokeLinecap="round"
            />
          ) : null}
          {hFill ? (
            <path
              d={hFill}
              fill="none"
              stroke={COLOR.h}
              strokeWidth={sw}
              strokeLinecap="round"
            />
          ) : null}

          {(
            [
              { t: pfToT(-YELLOW), text: "80" },
              { t: pfToT(-GREEN), text: "90" },
              { t: 0.5, text: "100" },
              { t: pfToT(GREEN), text: "90" },
              { t: pfToT(YELLOW), text: "80" },
            ] as const
          ).map((item, i) => {
            const p = polar(item.t, R + 22);
            return (
              <text
                key={`${item.text}-${i}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={COLOR.text}
                fontSize={item.text === "100" ? 11 : 10}
                fontWeight="700"
              >
                {item.t < 0.5 ? `−${item.text}` : item.text}
              </text>
            );
          })}

          <text
            x={polar(0.03, R - 24).x}
            y={CY + 18}
            textAnchor="start"
            fill={COLOR.muted}
            fontSize="10"
            fontWeight="700"
            letterSpacing="0.08em"
          >
            LEAD
          </text>
          <text
            x={polar(0.97, R - 24).x}
            y={CY + 18}
            textAnchor="end"
            fill={COLOR.muted}
            fontSize="10"
            fontWeight="700"
            letterSpacing="0.08em"
          >
            LAG
          </text>

          {tB != null ? (
            <RimMarker
              t={tB}
              fill={COLOR.before}
              radius={overlap ? 5 : 6}
              r={overlap ? rQ - 2 : rQ}
            />
          ) : null}
          {tA != null ? (
            <RimMarker
              t={tA}
              fill={showH ? COLOR.h : COLOR.q}
              radius={overlap ? 7 : 8}
              r={overlap ? rH : showH ? rH : rQ}
            />
          ) : null}
        </svg>
      </div>

      <div className="pf-compare-readout">
        <div className="pf-compare-chip pf-compare-chip--before">
          <span className="pf-compare-chip-tag">보상 전</span>
          <span className="pf-compare-chip-val">
            {b != null ? fmt(b) : "—"}
          </span>
          <span className="pf-compare-chip-side">
            {b != null ? sideOf(b) : ""}
          </span>
        </div>
        <span className="pf-compare-arrow" aria-hidden>
          →
        </span>
        <div className="pf-compare-chip pf-compare-chip--after">
          <span className="pf-compare-chip-tag">보상 후</span>
          <span className="pf-compare-chip-val">
            {a != null ? fmt(a) : "—"}
          </span>
          <span className="pf-compare-chip-side">
            {a != null ? sideOf(a) : ""}
          </span>
        </div>
      </div>
      {deltaLabel ? (
        <p className="pf-compare-delta">
          이동 {deltaLabel}
        </p>
      ) : null}
      <QtyValues
        kind={kind}
        qBefore={qBefore}
        qAfter={qAfter}
        hBefore={hBefore}
        hAfter={hAfter}
      />
    </article>
  );
}
