import { WATCH_THRESHOLDS } from "./watchThresholds";

/**
 * 상 전류가 수 A이면 THDi 분모(기본파)가 작아 수치가 커진다.
 * 이상 판정에서 빼는 경부하 하한과 같은 값.
 */
export function isLowLoadCurrent(
  amps: number | null | undefined,
): amps is number {
  return (
    amps != null &&
    Number.isFinite(amps) &&
    amps < WATCH_THRESHOLDS.loadGateMinCurrent
  );
}

export const LOW_LOAD_HINT =
  "부하가 낮으면 THDi가 높게 표시될 수 있습니다.";
