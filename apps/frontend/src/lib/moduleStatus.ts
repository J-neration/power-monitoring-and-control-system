/** HMI moduleStatus[] 코드 (deviceService.toStatus 와 동일 스케일) */
const META: Record<number, { label: string; className: string }> = {
  0: { label: "STANDBY", className: "module-chip-standby" },
  1: { label: "START", className: "module-chip-start" },
  2: { label: "RUNNING", className: "module-chip-running" },
  3: { label: "FAULT", className: "module-chip-fault" },
  4: { label: "OFFLINE", className: "module-chip-offline" },
};

export function moduleStatusLabel(code: number | undefined): string {
  if (code === undefined || code === null || Number.isNaN(code)) {
    return "—";
  }
  return META[code]?.label ?? `CODE ${code}`;
}

/** `module-chip` + 상태용 클래스 */
export function moduleChipClassName(code: number | undefined): string {
  if (code === undefined || code === null || Number.isNaN(code)) {
    return "module-chip module-chip-unknown";
  }
  const m = META[code];
  return m ? `module-chip ${m.className}` : "module-chip module-chip-unknown";
}

/** 전원 ON에 가깝다고 볼 수 있는 텔레메트리 (표시용 힌트) */
export function moduleTelemetrySuggestsOn(code: number | undefined): boolean {
  return code === 1 || code === 2;
}
