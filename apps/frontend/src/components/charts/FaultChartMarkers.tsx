import { ReferenceLine } from "recharts";
import type { FaultEvent } from "../../lib/api";
import { fmtChartTime } from "../../lib/chartTheme";

type TimeRow = { time: string; recordedAt: string };

type Marker = {
  key: string;
  x: string;
  index: number;
  labels: string[];
  slot: number;
};

const ROW_H = 13;
const MAX_ROWS = 4;

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

function faultLabel(module: number): string {
  return module ? `M${module}` : "장애";
}

function labelSort(a: string, b: string): number {
  const am = /^M(\d+)$/.exec(a);
  const bm = /^M(\d+)$/.exec(b);
  if (am && bm) return Number(am[1]) - Number(bm[1]);
  if (am) return -1;
  if (bm) return 1;
  return a.localeCompare(b, "ko");
}

function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += ch.charCodeAt(0) > 255 ? 11 : 7;
  return width + 8;
}

/** 글자 너비만큼 가까운 눈금은 같은 높이면 겹친다. */
function collisionGap(pointCount: number): number {
  return Math.max(1, Math.ceil((36 * Math.max(pointCount, 1)) / 680));
}

function buildMarkers(faults: FaultEvent[], data: TimeRow[]): Marker[] {
  const indexByTime = new Map<string, number>();
  data.forEach((row, index) => {
    if (!indexByTime.has(row.time)) indexByTime.set(row.time, index);
  });

  const grouped = new Map<string, { labels: Set<string>; index: number }>();
  for (const fault of faults) {
    const x = nearestTime(fault.occurredAt, data) ?? fmtChartTime(fault.occurredAt);
    const index = indexByTime.get(x) ?? data.length;
    const group = grouped.get(x) ?? { labels: new Set<string>(), index };
    group.labels.add(faultLabel(fault.module));
    grouped.set(x, group);
  }

  const markers: Marker[] = [...grouped.entries()]
    .map(([x, group]) => {
      const labels = [...group.labels].sort(labelSort);
      const shown =
        labels.length > MAX_ROWS
          ? [...labels.slice(0, MAX_ROWS - 1), `외 ${labels.length - (MAX_ROWS - 1)}`]
          : labels;
      return { key: x, x, index: group.index, labels: shown, slot: 0 };
    })
    .sort((a, b) => a.index - b.index);

  const gap = collisionGap(data.length);
  const placed: { index: number; slot: number; rows: number }[] = [];
  for (const marker of markers) {
    const used = new Set<number>();
    for (const prev of placed) {
      if (marker.index - prev.index > gap) continue;
      for (let row = 0; row < prev.rows; row++) used.add(prev.slot + row);
    }
    let slot = 0;
    while (marker.labels.some((_, row) => used.has(slot + row))) slot += 1;
    marker.slot = slot;
    placed.push({ index: marker.index, slot, rows: marker.labels.length });
  }
  return markers;
}

function FaultMarkerLabel({
  viewBox,
  lines,
  slot,
}: {
  viewBox?: { x?: number; y?: number };
  lines: string[];
  slot: number;
}) {
  const x = (viewBox?.x ?? 0) + 3;
  const y = (viewBox?.y ?? 0) + 2 + slot * ROW_H;
  const width = Math.max(...lines.map(textWidth));
  const height = lines.length * ROW_H + 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={x - 1}
        y={y}
        width={width}
        height={height}
        rx={2}
        fill="rgba(11, 15, 22, 0.92)"
      />
      {lines.map((line, i) => (
        <text
          key={`${line}-${i}`}
          x={x + 3}
          y={y + 11 + i * ROW_H}
          fill="#f87171"
          fontSize={10}
          fontWeight={650}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export default function FaultChartMarkers({
  faults,
  data,
}: {
  faults: FaultEvent[];
  data: TimeRow[];
}) {
  if (!faults.length) return null;

  const markers = buildMarkers(faults, data);

  return (
    <>
      {markers.map((marker) => (
        <ReferenceLine
          key={marker.key}
          x={marker.x}
          stroke="#f87171"
          strokeDasharray="3 2"
          strokeOpacity={0.85}
          label={(props: { viewBox?: { x?: number; y?: number } }) => (
            <FaultMarkerLabel viewBox={props.viewBox} lines={marker.labels} slot={marker.slot} />
          )}
        />
      ))}
    </>
  );
}
