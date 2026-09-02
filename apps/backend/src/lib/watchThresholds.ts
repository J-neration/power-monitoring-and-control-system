/** 모니터/이력과 같은 기준. 백엔드 이상 판정 전용. */
export const WATCH_THRESHOLDS = {
  pfWarn: 90,
  pfDanger: 85,
  thdDanger: 20,
  areaWarn: 35,
  areaAlarm: 40,
  moduleWarn: 40,
  moduleAlarm: 90,
  voltageNominal: 220,
  voltageWarnPct: 0.05,
  voltageDangerPct: 0.1,
  unbalanceWarnPct: 2,
} as const;
