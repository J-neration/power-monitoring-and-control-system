import { moduleChipClassName, moduleStatusLabel } from "../lib/moduleStatus";

const MODULE_LABEL_KO: Record<string, string> = {
  STANDBY: "대기",
  START: "기동",
  RUNNING: "가동",
  FAULT: "이상",
  OFFLINE: "오프라인",
};

type Props = {
  moduleStatus?: number[];
  numOfMods?: number;
  compact?: boolean;
};

export default function ModuleSlotGrid({
  moduleStatus = [],
  numOfMods,
  compact = false,
}: Props) {
  const sliced =
    numOfMods != null && numOfMods > 0 && numOfMods <= moduleStatus.length
      ? moduleStatus.slice(0, numOfMods)
      : moduleStatus;

  if (sliced.filter((c) => c !== 4).length === 0) return null;

  return (
    <div className={`module-slot-grid${compact ? " module-slot-grid--compact" : ""}`}>
      <span className="module-slot-grid-title">모듈</span>
      <div className="module-slot-grid-cells">
        {sliced.map((code, index) => {
          if (code === 4) return null;
          const en = moduleStatusLabel(code);
          const label = MODULE_LABEL_KO[en] ?? en;
          const chipClass = moduleChipClassName(code);
          const slotVariant = chipClass.includes("running")
            ? "running"
            : chipClass.includes("fault")
              ? "fault"
              : chipClass.includes("offline")
                ? "offline"
                : chipClass.includes("start")
                  ? "start"
                  : "standby";

          return (
            <div
              key={`mod-${index}`}
              className={`module-slot module-slot--${slotVariant}`}
              title={`M${index + 1} ${label}`}
            >
              <span className="module-slot-id">M{index + 1}</span>
              <span className="module-slot-state">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
