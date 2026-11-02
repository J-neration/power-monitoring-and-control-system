import { ReferenceLine } from "recharts";
import {
  PF_THRESHOLDS,
  THD_LOW_LOAD_COLOR,
  THD_THRESHOLDS,
} from "../../lib/chartTheme";

type Kind = "thd" | "pf";

const CONFIG = {
  thd: [
    { y: THD_THRESHOLDS.danger, label: "위험 20%", color: "#f87171" },
  ],
  pf: [
    { y: PF_THRESHOLDS.warn, label: "주의 90%", color: "#fbbf24" },
    { y: PF_THRESHOLDS.danger, label: "위험 85%", color: "#f87171" },
  ],
} as const;

export default function ChartThresholdLines({
  kind,
  muteDanger = false,
}: {
  kind: Kind;
  /** 표시 중인 상이 모두 저부하면 THDi 위험선을 참고색으로 옅게 둔다. */
  muteDanger?: boolean;
}) {
  return (
    <>
      {CONFIG[kind].map((line) => {
        const muted = muteDanger && kind === "thd";
        const color = muted ? THD_LOW_LOAD_COLOR : line.color;
        return (
          <ReferenceLine
            key={line.label}
            y={line.y}
            stroke={color}
            strokeDasharray="4 3"
            strokeOpacity={muted ? 0.45 : 0.75}
            label={{
              value: muted ? line.label.replace("위험", "참고") : line.label,
              fill: color,
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
        );
      })}
    </>
  );
}
