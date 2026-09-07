import { QUALITY_REFS } from "../../lib/opsSavings";

type Props = {
  label: string;
  value?: number | null;
  before?: number | null;
};

const SCALE = QUALITY_REFS.voltageUnbalanceDangerPct;
const MOTOR = QUALITY_REFS.voltageUnbalanceMotorPct;
const LIMIT = QUALITY_REFS.voltageUnbalanceLimitPct;

function finite(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function tone(v: number): "ok" | "warn" | "danger" {
  if (v >= LIMIT) return "danger";
  if (v >= MOTOR) return "warn";
  return "ok";
}

function widthPct(v: number): number {
  return Math.min(100, Math.max(0, (Math.abs(v) / SCALE) * 100));
}

function fmt(v: number) {
  return `${v.toFixed(2)}%`;
}

export default function UnbalanceLimitBar({ label, value, before }: Props) {
  const after = finite(value);
  const pre = finite(before);
  const shown = after ?? pre;

  if (shown == null) {
    return (
      <article className="unb-limit unb-limit--empty">
        <span className="unb-limit-label">{label}</span>
        <p className="unb-limit-muted">데이터 없음</p>
      </article>
    );
  }

  const afterTone = after != null ? tone(Math.abs(after)) : tone(Math.abs(shown));

  return (
    <article className={`unb-limit unb-limit--${afterTone}`}>
      <header className="unb-limit-head">
        <span className="unb-limit-label">{label}</span>
        <span className="unb-limit-readout">
          {pre != null && after != null ? (
            <>
              <span className="unb-limit-before">{fmt(pre)}</span>
              <span className="unb-limit-arrow">→</span>
            </>
          ) : null}
          <span className="unb-limit-after">{fmt(shown)}</span>
        </span>
      </header>
      <div className="unb-limit-track" role="img" aria-label={`${label} ${fmt(shown)}`}>
        {pre != null ? (
          <span
            className="unb-limit-fill unb-limit-fill--before"
            style={{ width: `${widthPct(pre)}%` }}
          />
        ) : null}
        <span
          className="unb-limit-fill unb-limit-fill--after"
          style={{ width: `${widthPct(shown)}%` }}
        />
        <span className="unb-limit-tick" style={{ left: `${(MOTOR / SCALE) * 100}%` }} />
        <span className="unb-limit-tick" style={{ left: `${(LIMIT / SCALE) * 100}%` }} />
      </div>
      <div className="unb-limit-scale">
        <span>0</span>
        <span className="unb-limit-scale-mark" style={{ left: `${(MOTOR / SCALE) * 100}%` }}>
          전동기 {MOTOR}%
        </span>
        <span className="unb-limit-scale-mark" style={{ left: `${(LIMIT / SCALE) * 100}%` }}>
          계통 {LIMIT}%
        </span>
        <span>위험 {SCALE}%</span>
      </div>
    </article>
  );
}
