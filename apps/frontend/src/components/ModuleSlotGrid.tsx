import { moduleChipClassName, moduleStatusLabel } from "../lib/moduleStatus";

const MODULE_LABEL_KO: Record<string, string> = {
  STANDBY: "대기",
  START: "기동",
  RUNNING: "가동중",
  FAULT: "이상",
  OFFLINE: "오프라인",
};

function fmtCap(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

type Props = {
  moduleStatus?: number[];
  numOfMods?: number;
  moduleCapacity?: number[];
  capUnit?: string;
  compact?: boolean;
  className?: string;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
};

export function hasVisibleModuleSlots(
  moduleStatus: number[] = [],
  numOfMods?: number,
): boolean {
  const sliced =
    numOfMods != null && numOfMods > 0 && numOfMods <= moduleStatus.length
      ? moduleStatus.slice(0, numOfMods)
      : moduleStatus;
  return sliced.some((c) => c !== 4);
}

export default function ModuleSlotGrid({
  moduleStatus = [],
  numOfMods,
  moduleCapacity,
  capUnit = "kvar",
  compact = false,
  className = "",
  selectedIndex,
  onSelect,
}: Props) {
  const sliced =
    numOfMods != null && numOfMods > 0 && numOfMods <= moduleStatus.length
      ? moduleStatus.slice(0, numOfMods)
      : moduleStatus;

  if (sliced.filter((c) => c !== 4).length === 0) return null;

  return (
    <div
      className={`module-slot-grid${compact ? " module-slot-grid--compact" : ""}${className ? ` ${className}` : ""}`}
    >
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
          const n = index + 1;
          const cap = moduleCapacity?.[index];
          const capText =
            cap != null && Number.isFinite(cap)
              ? `${fmtCap(cap)}${capUnit}`
              : null;
          const summary = capText
            ? `모듈 ${n}번 ${capText} ${label}`
            : `모듈 ${n}번 ${label}`;
          const selected = selectedIndex === index;
          const classNameSlot = `module-slot module-slot--${slotVariant}${selected ? " module-slot--selected" : ""}`;

          const inner = (
            <>
              <span className="module-slot-id">{n}번</span>
              {capText ? (
                <span className="module-slot-cap">{capText}</span>
              ) : null}
              <span className="module-slot-state">{label}</span>
            </>
          );

          if (onSelect) {
            return (
              <button
                key={`mod-${index}`}
                type="button"
                className={classNameSlot}
                title={summary}
                aria-label={summary}
                aria-pressed={selected}
                onClick={() => onSelect(index)}
              >
                {inner}
              </button>
            );
          }

          return (
            <div
              key={`mod-${index}`}
              className={classNameSlot}
              title={summary}
              aria-label={summary}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
