import type { Device } from "../types/site";
import MetricValue from "./MetricValue";

function avgVoltage(d: Device): number | null {
  const vals = [d.vL1, d.vL2, d.vL3].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function maxGridThd(d: Device): number | null {
  const vals = [d.gridCurrentTHDL1, d.gridCurrentTHDL2, d.gridCurrentTHDL3].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  return vals.length ? Math.max(...vals) : null;
}

function KpiCell({
  label,
  value,
  suffix = "",
  kind = "default" as "default" | "thd" | "voltage" | "pf",
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
  kind?: "default" | "thd" | "voltage" | "pf";
}) {
  return (
    <div className="page-kpi-cell">
      <span className="page-kpi-label">{label}</span>
      <MetricValue value={value} kind={kind} suffix={suffix} digits={kind === "pf" ? 1 : 1} />
    </div>
  );
}

export default function DeviceKpiStrip({ device }: { device: Device }) {
  const thdMax = maxGridThd(device);

  return (
    <div className="page-kpi-strip device-kpi-strip">
      <KpiCell label="Grid V avg" value={avgVoltage(device)} kind="voltage" suffix=" V" />
      <KpiCell label="Grid THD max" value={thdMax} kind="thd" suffix="%" />
      <KpiCell label="Grid TPF" value={device.tpf2} kind="pf" suffix="%" />
      <KpiCell label="Grid DPF" value={device.dpf2} kind="pf" suffix="%" />
      <KpiCell label="Grid I L1" value={device.gridCurrentL1} suffix=" A" />
      <KpiCell label="Grid I L2" value={device.gridCurrentL2} suffix=" A" />
      <KpiCell label="Grid I L3" value={device.gridCurrentL3} suffix=" A" />
    </div>
  );
}
