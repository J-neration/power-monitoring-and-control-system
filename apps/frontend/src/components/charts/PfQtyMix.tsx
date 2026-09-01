"use client";

type Kind = "tpf" | "dpf";

type Props = {
  kind: Kind;
  qBefore?: number | null;
  qAfter?: number | null;
  hBefore?: number | null;
  hAfter?: number | null;
};

function mag(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? Math.abs(v) : 0;
}

function fmt(v: number) {
  return v.toFixed(1);
}

function Seg({
  value,
  pct,
  tone,
}: {
  value: number;
  pct: number;
  tone: "q" | "q-dim" | "h" | "h-dim";
}) {
  if (value <= 0 || pct <= 0) return null;
  return (
    <span
      className={`pf-qty-mix-seg pf-qty-mix-seg--${tone}`}
      style={{ width: `${pct}%` }}
    >
      {pct >= 16 ? fmt(value) : ""}
    </span>
  );
}

function Row({
  label,
  q,
  h,
  max,
  dim,
  showH,
}: {
  label: string;
  q: number;
  h: number;
  max: number;
  dim: boolean;
  showH: boolean;
}) {
  const qPct = max > 0 ? (q / max) * 100 : 0;
  const hPct = showH && max > 0 ? (h / max) * 100 : 0;
  const total = showH ? q + h : q;

  return (
    <div className="pf-qty-mix-row">
      <span className="pf-qty-mix-label">{label}</span>
      <div className="pf-qty-mix-track">
        <Seg value={q} pct={qPct} tone={dim ? "q-dim" : "q"} />
        {showH ? <Seg value={h} pct={hPct} tone={dim ? "h-dim" : "h"} /> : null}
      </div>
      <span className="pf-qty-mix-share">
        {fmt(total)}
        <span className="pf-qty-mix-unit">kvar</span>
      </span>
    </div>
  );
}

export default function PfQtyMix({
  kind,
  qBefore,
  qAfter,
  hBefore,
  hAfter,
}: Props) {
  const qb = mag(qBefore);
  const qa = mag(qAfter);
  const hb = mag(hBefore);
  const ha = mag(hAfter);
  const showH = kind === "tpf";
  const before = showH ? qb + hb : qb;
  const after = showH ? qa + ha : qa;
  const max = Math.max(before, after, 0.001);

  if (before + after <= 0) {
    return (
      <div className="pf-qty-mix pf-qty-mix--empty">
        <p>{kind === "tpf" ? "Q · H 없음" : "Q 없음"}</p>
      </div>
    );
  }

  return (
    <div
      className={`pf-qty-mix pf-qty-mix--${kind}`}
      role="img"
      aria-label={
        kind === "tpf"
          ? `TPF 전 Q ${fmt(qb)} H ${fmt(hb)}, 후 Q ${fmt(qa)} H ${fmt(ha)} kvar`
          : `DPF 전 Q ${fmt(qb)}, 후 Q ${fmt(qa)} kvar`
      }
    >
      <div className="pf-qty-mix-head">
        {kind === "tpf" ? (
          <span className="pf-qty-mix-formula">
            <span className="pf-qty-pill pf-qty-pill--q">Q</span>
            <span className="pf-qty-plus">+</span>
            <span className="pf-qty-pill pf-qty-pill--h">H</span>
          </span>
        ) : (
          <span className="pf-qty-mix-formula">
            <span className="pf-qty-pill pf-qty-pill--q">Q</span>
          </span>
        )}
      </div>
      <Row label="전" q={qb} h={hb} max={max} dim showH={showH} />
      <Row label="후" q={qa} h={ha} max={max} dim={false} showH={showH} />
    </div>
  );
}
