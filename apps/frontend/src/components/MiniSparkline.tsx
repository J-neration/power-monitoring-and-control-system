type Props = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
  label?: string;
};

export default function MiniSparkline({
  values,
  width = 120,
  height = 28,
  stroke = "#63b3ed",
  className = "",
  label,
}: Props) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) {
    return (
      <div
        className={`mini-sparkline mini-sparkline--empty ${className}`.trim()}
        aria-hidden
      >
        <span className="mini-sparkline-placeholder">—</span>
      </div>
    );
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = finite
    .map((v, i) => {
      const x = pad + (i / (finite.length - 1)) * innerW;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className={`mini-sparkline ${className}`.trim()}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "추세 차트"}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
