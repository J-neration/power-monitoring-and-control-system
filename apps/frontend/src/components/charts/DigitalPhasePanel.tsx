import MetricValue from "../MetricValue";

type PhaseRow = {
  label: string;
  l1?: number | null;
  l2?: number | null;
  l3?: number | null;
  kind?: "default" | "thd" | "voltage" | "pf";
  suffix?: string;
};

export default function DigitalPhasePanel({ rows }: { rows: PhaseRow[] }) {
  return (
    <div className="digital-phase-panel">
      <div className="digital-phase-header">
        <span />
        <span>L1</span>
        <span>L2</span>
        <span>L3</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="digital-phase-row">
          <span className="digital-phase-label">{row.label}</span>
          <MetricValue value={row.l1} kind={row.kind} suffix={row.suffix} />
          <MetricValue value={row.l2} kind={row.kind} suffix={row.suffix} />
          <MetricValue value={row.l3} kind={row.kind} suffix={row.suffix} />
        </div>
      ))}
    </div>
  );
}
