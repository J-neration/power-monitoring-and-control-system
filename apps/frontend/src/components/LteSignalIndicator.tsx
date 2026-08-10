import type { Device } from "../types/site";
import {
  formatLastSeen,
  formatLteSignalDetail,
  getLteSignalInfo,
} from "../lib/lteSignal";

type Props = {
  device?: Device | null;
  variant?: "compact" | "detail";
  className?: string;
};

export default function LteSignalIndicator({
  device,
  variant = "compact",
  className = "",
}: Props) {
  const offline = !device || device.status === "offline";
  const info = getLteSignalInfo(device?.rsrp, device?.csq, offline);
  const detail = formatLteSignalDetail(info);
  const lastSeen = formatLastSeen(device?.lastSeenAt);
  const title = [
    info.label,
    detail,
    lastSeen ? `마지막 수신 ${lastSeen}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`lte-signal lte-signal--${info.grade} lte-signal--${variant} ${className}`.trim()}
      title={title}
    >
      <span className="lte-signal-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={`lte-signal-bar${bar <= info.bars ? " lte-signal-bar--on" : ""}`}
          />
        ))}
      </span>
      <span className="lte-signal-label">{info.label}</span>
      {variant === "detail" && (detail || lastSeen) && (
        <span className="lte-signal-meta">
          {[detail, lastSeen ? `마지막 수신 ${lastSeen}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </div>
  );
}
