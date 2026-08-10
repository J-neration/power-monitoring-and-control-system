import { ReferenceLine } from "recharts";
import type { FaultEvent } from "../../lib/api";
import { fmtChartTime } from "../../lib/chartTheme";

type TimeRow = { time: string; recordedAt: string };

function nearestTime(faultAt: string, data: TimeRow[]): string | null {
  if (!data.length) return null;
  const t = new Date(faultAt).getTime();
  let best = data[0];
  let bestDiff = Math.abs(new Date(best.recordedAt).getTime() - t);
  for (const row of data) {
    const diff = Math.abs(new Date(row.recordedAt).getTime() - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  return best.time;
}

export default function FaultChartMarkers({
  faults,
  data,
}: {
  faults: FaultEvent[];
  data: TimeRow[];
}) {
  if (!faults.length) return null;

  const seen = new Set<string>();
  const markers: { key: string; x: string; label: string }[] = [];

  for (const f of faults) {
    const x = nearestTime(f.occurredAt, data) ?? fmtChartTime(f.occurredAt);
    const dedupe = `${x}-${f.module}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    markers.push({
      key: f.id,
      x,
      label: f.module ? `M${f.module}` : "장애",
    });
  }

  return (
    <>
      {markers.map((m) => (
        <ReferenceLine
          key={m.key}
          x={m.x}
          stroke="#f87171"
          strokeDasharray="3 2"
          strokeOpacity={0.85}
          label={{
            value: m.label,
            fill: "#f87171",
            fontSize: 9,
            position: "insideTopLeft",
          }}
        />
      ))}
    </>
  );
}
