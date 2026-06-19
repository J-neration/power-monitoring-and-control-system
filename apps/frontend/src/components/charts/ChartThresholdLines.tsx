import { ReferenceLine } from "recharts";
import { PF_THRESHOLDS, THD_THRESHOLDS } from "../../lib/chartTheme";

type Kind = "thd" | "pf";

const CONFIG = {
  thd: [
    { y: THD_THRESHOLDS.warn, label: "주의 5%", color: "#fbbf24" },
    { y: THD_THRESHOLDS.danger, label: "위험 8%", color: "#f87171" },
  ],
  pf: [
    { y: PF_THRESHOLDS.warn, label: "주의 90%", color: "#fbbf24" },
    { y: PF_THRESHOLDS.danger, label: "위험 85%", color: "#f87171" },
  ],
} as const;

export default function ChartThresholdLines({ kind }: { kind: Kind }) {
  return (
    <>
      {CONFIG[kind].map((line) => (
        <ReferenceLine
          key={line.label}
          y={line.y}
          stroke={line.color}
          strokeDasharray="4 3"
          strokeOpacity={0.75}
          label={{
            value: line.label,
            fill: line.color,
            fontSize: 10,
            position: "insideTopRight",
          }}
        />
      ))}
    </>
  );
}
