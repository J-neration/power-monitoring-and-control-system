import type { DeviceWithInstallation } from "../types/site";
import MetricValue from "./MetricValue";

type Props = {
  device: DeviceWithInstallation;
};

type Kind = "default" | "thd" | "voltage" | "pf";

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

function avg3(
  a?: number | null,
  b?: number | null,
  c?: number | null,
): number | null {
  const xs = [a, b, c].filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function delta(after: number | null, before: number | null): number | null {
  if (after == null || before == null) return null;
  return after - before;
}

function CompareMetric({
  value,
  unit,
  kind,
  digits,
}: {
  value?: number | null;
  unit: string;
  kind?: Kind;
  digits?: number;
}) {
  const has = value != null && Number.isFinite(value);
  return (
    <span className={`hmi-compare-metric${unit === "%" ? " is-pct" : ""}`}>
      <MetricValue value={value} kind={kind} digits={digits} />
      {has ? <span className="hmi-compare-metric-unit">{unit}</span> : null}
    </span>
  );
}

function PhaseRow({
  tag,
  name,
  unit,
  l1,
  l2,
  l3,
  kind,
  digits = 1,
}: {
  tag: string;
  name?: string;
  unit: string;
  l1?: number | null;
  l2?: number | null;
  l3?: number | null;
  kind?: Kind;
  digits?: number;
}) {
  return (
    <div className="hmi-compare-row">
      <span className="hmi-compare-tag">
        {tag}
        {name ? <span className="hmi-compare-name">{name}</span> : null}
      </span>
      <CompareMetric value={l1} unit={unit} kind={kind} digits={digits} />
      <CompareMetric value={l2} unit={unit} kind={kind} digits={digits} />
      <CompareMetric value={l3} unit={unit} kind={kind} digits={digits} />
    </div>
  );
}

function PfSum({
  tpf,
  dpf,
}: {
  tpf?: number | null;
  dpf?: number | null;
}) {
  return (
    <div className="hmi-compare-sum" aria-label="3상 합계 역률">
      <span className="hmi-compare-sum-kicker">3상 합계</span>
      <div className="hmi-compare-sum-cell">
        <span className="hmi-compare-tag">
          TPF
          <span className="hmi-compare-name">종합역률</span>
        </span>
        <CompareMetric value={tpf} unit="%" kind="pf" digits={2} />
      </div>
      <div className="hmi-compare-sum-cell">
        <span className="hmi-compare-tag">
          DPF
          <span className="hmi-compare-name">변위역률</span>
        </span>
        <CompareMetric value={dpf} unit="%" kind="pf" digits={2} />
      </div>
    </div>
  );
}

function PhaseBay({
  side,
  title,
  kicker,
  current,
  thd,
  tpf,
  dpf,
}: {
  side: "load" | "grid";
  title: string;
  kicker: string;
  current: { l1?: number | null; l2?: number | null; l3?: number | null };
  thd: { l1?: number | null; l2?: number | null; l3?: number | null };
  tpf?: number | null;
  dpf?: number | null;
}) {
  return (
    <article className={`hmi-compare-bay hmi-compare-bay--${side}`}>
      <header className="hmi-compare-bay-head">
        <span className="hmi-compare-kicker">{kicker}</span>
        <h3>{title}</h3>
      </header>
      <div className="hmi-compare-cols" aria-hidden>
        <span>TAG</span>
        <span>L1</span>
        <span>L2</span>
        <span>L3</span>
      </div>
      <PhaseRow
        tag="I"
        name="전류"
        unit="A"
        l1={current.l1}
        l2={current.l2}
        l3={current.l3}
      />
      <PhaseRow
        tag="THDi"
        name="왜곡"
        unit="%"
        l1={thd.l1}
        l2={thd.l2}
        l3={thd.l3}
        kind="thd"
      />
      <div className="hmi-compare-rule" />
      <PfSum tpf={tpf} dpf={dpf} />
    </article>
  );
}

function PowerCell({
  tag,
  name,
  unit,
  value,
}: {
  tag: "S" | "P" | "Q" | "H";
  name: string;
  unit: string;
  value?: number | null;
}) {
  return (
    <div className={`hmi-power-cell hmi-power-cell--${tag.toLowerCase()}`}>
      <span className="hmi-power-cell-tag">
        {tag}
        <span className="hmi-power-cell-name">{name}</span>
      </span>
      <span className="hmi-power-cell-val">
        <MetricValue value={value} digits={1} />
        <span className="hmi-power-cell-unit">{unit}</span>
      </span>
    </div>
  );
}

function PowerBay({
  side,
  title,
  kicker,
  s,
  p,
  q,
  h,
}: {
  side: "load" | "grid";
  title: string;
  kicker: string;
  s?: number | null;
  p?: number | null;
  q?: number | null;
  h?: number | null;
}) {
  return (
    <article className={`hmi-compare-bay hmi-compare-bay--${side}`}>
      <header className="hmi-compare-bay-head">
        <span className="hmi-compare-kicker">{kicker}</span>
        <h3>{title}</h3>
      </header>
      <div className="hmi-power-grid">
        <PowerCell tag="S" name="피상전력" unit="kVA" value={s} />
        <PowerCell tag="P" name="유효전력" unit="kW" value={p} />
        <PowerCell tag="Q" name="무효전력" unit="kvar" value={q} />
        <PowerCell tag="H" name="고조파" unit="kvar" value={h} />
      </div>
    </article>
  );
}

function DeltaCell({
  label,
  unit,
  before,
  after,
  better,
  digits = 1,
}: {
  label: string;
  unit: string;
  before: number | null;
  after: number | null;
  better: "up" | "down";
  digits?: number;
}) {
  const d = delta(after, before);
  if (d == null) {
    return (
      <div className="hmi-delta-cell hmi-delta-cell--empty">
        <span className="hmi-delta-label">{label}</span>
        <span className="hmi-delta-value">—</span>
      </div>
    );
  }
  const improved = better === "down" ? d < -0.05 : d > 0.05;
  const sign = d > 0 ? "+" : "";
  return (
    <div className={`hmi-delta-cell${improved ? " is-better" : ""}`}>
      <span className="hmi-delta-label">{label}</span>
      <span className="hmi-delta-value">
        {sign}
        {d.toFixed(digits)}
        <span className="hmi-delta-unit">{unit}</span>
      </span>
    </div>
  );
}

export default function DeviceCompareTable({ device }: Props) {
  const iBefore = avg3(device.loadCurrentL1, device.loadCurrentL2, device.loadCurrentL3);
  const iAfter = avg3(device.gridCurrentL1, device.gridCurrentL2, device.gridCurrentL3);
  const thdBefore = avg3(
    device.loadCurrentTHDL1,
    device.loadCurrentTHDL2,
    device.loadCurrentTHDL3,
  );
  const thdAfter = avg3(
    device.gridCurrentTHDL1,
    device.gridCurrentTHDL2,
    device.gridCurrentTHDL3,
  );

  const loadCurrent = {
    l1: device.loadCurrentL1,
    l2: device.loadCurrentL2,
    l3: device.loadCurrentL3,
  };
  const gridCurrent = {
    l1: device.gridCurrentL1,
    l2: device.gridCurrentL2,
    l3: device.gridCurrentL3,
  };
  const loadThd = {
    l1: device.loadCurrentTHDL1,
    l2: device.loadCurrentTHDL2,
    l3: device.loadCurrentTHDL3,
  };
  const gridThd = {
    l1: device.gridCurrentTHDL1,
    l2: device.gridCurrentTHDL2,
    l3: device.gridCurrentTHDL3,
  };

  return (
    <div className="device-compare-panel">
      <div className="hmi-compare-head">
        <span className="hmi-compare-ch">04</span>
        <span className="hmi-compare-title">실시간 계측 비교</span>
        <span className="hmi-compare-flow">
          LOAD
          <span aria-hidden>→</span>
          GRID
        </span>
        <div className="hmi-compare-bus" aria-label="계통 전압 RMS">
          <span className="hmi-compare-bus-label">계통 전압 RMS</span>
          <div className="hmi-compare-bus-phases">
            <span className="hmi-compare-bus-phase">
              <span className="hmi-compare-bus-phase-tag">L1</span>
              <MetricValue value={device.vL1} kind="voltage" digits={1} />
              <span className="hmi-compare-bus-unit">V</span>
            </span>
            <span className="hmi-compare-bus-phase">
              <span className="hmi-compare-bus-phase-tag">L2</span>
              <MetricValue value={device.vL2} kind="voltage" digits={1} />
              <span className="hmi-compare-bus-unit">V</span>
            </span>
            <span className="hmi-compare-bus-phase">
              <span className="hmi-compare-bus-phase-tag">L3</span>
              <MetricValue value={device.vL3} kind="voltage" digits={1} />
              <span className="hmi-compare-bus-unit">V</span>
            </span>
          </div>
        </div>
      </div>

      <div className="hmi-compare-stack">
        <section className="hmi-compare-block" aria-label="전류 고조파 역률">
          <div className="hmi-compare-block-label">전류 · THD · 역률</div>
          <div className="hmi-compare-bays">
            <PhaseBay
              side="load"
              kicker="LOAD"
              title="보상 전"
              current={loadCurrent}
              thd={loadThd}
              tpf={device.tpf1}
              dpf={device.dpf1}
            />
            <aside className="hmi-compare-spine" aria-label="보상 전후 차이">
              <span className="hmi-delta-head">Δ</span>
              <DeltaCell label="I" unit="A" before={iBefore} after={iAfter} better="down" />
              <DeltaCell
                label="THDi"
                unit="%"
                before={thdBefore}
                after={thdAfter}
                better="down"
              />
              <DeltaCell
                label="TPF"
                unit="%"
                before={num(device.tpf1)}
                after={num(device.tpf2)}
                better="up"
              />
              <DeltaCell
                label="DPF"
                unit="%"
                before={num(device.dpf1)}
                after={num(device.dpf2)}
                better="up"
              />
            </aside>
            <PhaseBay
              side="grid"
              kicker="GRID"
              title="보상 후"
              current={gridCurrent}
              thd={gridThd}
              tpf={device.tpf2}
              dpf={device.dpf2}
            />
          </div>
        </section>

        <section className="hmi-compare-block" aria-label="전력 SPQH">
          <div className="hmi-compare-block-label">전력 · 3상 합계</div>
          <div className="hmi-compare-bays">
            <PowerBay
              side="load"
              kicker="LOAD"
              title="보상 전"
              s={device.uncompS}
              p={device.uncompP}
              q={device.uncompQ}
              h={device.uncompH}
            />
            <aside className="hmi-compare-spine" aria-label="전력 전후 차이">
              <span className="hmi-delta-head">Δ</span>
              <DeltaCell
                label="S"
                unit="kVA"
                before={num(device.uncompS)}
                after={num(device.compS)}
                better="down"
              />
              <DeltaCell
                label="P"
                unit="kW"
                before={num(device.uncompP)}
                after={num(device.compP)}
                better="down"
              />
              <DeltaCell
                label="Q"
                unit="kvar"
                before={num(device.uncompQ)}
                after={num(device.compQ)}
                better="down"
              />
              <DeltaCell
                label="H"
                unit="kvar"
                before={num(device.uncompH)}
                after={num(device.compH)}
                better="down"
              />
            </aside>
            <PowerBay
              side="grid"
              kicker="GRID"
              title="보상 후"
              s={device.compS}
              p={device.compP}
              q={device.compQ}
              h={device.compH}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
