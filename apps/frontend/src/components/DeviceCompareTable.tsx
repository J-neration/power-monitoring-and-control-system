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

function PhaseRow({
  tag,
  unit,
  l1,
  l2,
  l3,
  kind,
  digits = 1,
}: {
  tag: string;
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
        <span className="hmi-compare-unit">{unit}</span>
      </span>
      <MetricValue value={l1} kind={kind} digits={digits} />
      <MetricValue value={l2} kind={kind} digits={digits} />
      <MetricValue value={l3} kind={kind} digits={digits} />
    </div>
  );
}

function TotalRow({
  tag,
  unit,
  value,
  kind,
  digits = 2,
}: {
  tag: string;
  unit: string;
  value?: number | null;
  kind?: Kind;
  digits?: number;
}) {
  return (
    <div className="hmi-compare-row hmi-compare-row--total">
      <span className="hmi-compare-tag">
        {tag}
        <span className="hmi-compare-unit">{unit}</span>
      </span>
      <span className="hmi-compare-total">
        <MetricValue value={value} kind={kind} digits={digits} />
      </span>
    </div>
  );
}

function Bay({
  side,
  title,
  kicker,
  current,
  thd,
  tpf,
  dpf,
  s,
  p,
  q,
  h,
}: {
  side: "load" | "grid";
  title: string;
  kicker: string;
  current: { l1?: number | null; l2?: number | null; l3?: number | null };
  thd: { l1?: number | null; l2?: number | null; l3?: number | null };
  tpf?: number | null;
  dpf?: number | null;
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
      <div className="hmi-compare-cols" aria-hidden>
        <span>TAG</span>
        <span>L1</span>
        <span>L2</span>
        <span>L3</span>
      </div>
      <PhaseRow tag="I" unit="A" l1={current.l1} l2={current.l2} l3={current.l3} />
      <PhaseRow tag="THDi" unit="%" l1={thd.l1} l2={thd.l2} l3={thd.l3} kind="thd" />
      <div className="hmi-compare-rule" />
      <TotalRow tag="TPF" unit="%" value={tpf} kind="pf" />
      <TotalRow tag="DPF" unit="%" value={dpf} kind="pf" />
      <div className="hmi-compare-rule" />
      <TotalRow tag="S" unit="kVA" value={s} />
      <TotalRow tag="P" unit="kW" value={p} />
      <TotalRow tag="Q" unit="kvar" value={q} />
      <TotalRow tag="H" unit="kvar" value={h} />
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
      </div>

      <div className="hmi-compare-bays">
        <Bay
          side="load"
          kicker="LOAD"
          title="보상 전"
          current={{
            l1: device.loadCurrentL1,
            l2: device.loadCurrentL2,
            l3: device.loadCurrentL3,
          }}
          thd={{
            l1: device.loadCurrentTHDL1,
            l2: device.loadCurrentTHDL2,
            l3: device.loadCurrentTHDL3,
          }}
          tpf={device.tpf1}
          dpf={device.dpf1}
          s={device.uncompS}
          p={device.uncompP}
          q={device.uncompQ}
          h={device.uncompH}
        />

        <aside className="hmi-compare-spine" aria-label="보상 전후 차이">
          <span className="hmi-delta-head">Δ</span>
          <DeltaCell label="I" unit="A" before={iBefore} after={iAfter} better="down" />
          <DeltaCell label="THDi" unit="%" before={thdBefore} after={thdAfter} better="down" />
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

        <Bay
          side="grid"
          kicker="GRID"
          title="보상 후"
          current={{
            l1: device.gridCurrentL1,
            l2: device.gridCurrentL2,
            l3: device.gridCurrentL3,
          }}
          thd={{
            l1: device.gridCurrentTHDL1,
            l2: device.gridCurrentTHDL2,
            l3: device.gridCurrentTHDL3,
          }}
          tpf={device.tpf2}
          dpf={device.dpf2}
          s={device.compS}
          p={device.compP}
          q={device.compQ}
          h={device.compH}
        />
      </div>

      <footer className="hmi-compare-bus">
        <span className="hmi-compare-bus-label">계통 전압</span>
        <span>
          L1 <MetricValue value={device.vL1} kind="voltage" digits={1} />
          <span className="hmi-compare-bus-unit">V</span>
        </span>
        <span>
          L2 <MetricValue value={device.vL2} kind="voltage" digits={1} />
          <span className="hmi-compare-bus-unit">V</span>
        </span>
        <span>
          L3 <MetricValue value={device.vL3} kind="voltage" digits={1} />
          <span className="hmi-compare-bus-unit">V</span>
        </span>
      </footer>
    </div>
  );
}
