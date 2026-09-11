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

  /** 경부하 게이팅. THD·역률은 기본파가 작으면 값이 튀므로 판정에서 뺀다 */
  loadGateMinCurrent: 5,
  loadGateMinRatio: 0.2,
  /** 역률 절댓값이 이 아래면 미계측으로 본다 (전압 5V 미만 처리와 같은 취지) */
  pfValidMinMag: 10,

  /** 보상 성능. 부하측 THD가 이보다 낮으면 보상할 대상이 없다 */
  compThdMinBefore: 10,
  /** THD 저감률 (0~1) */
  compThdReductionWarn: 0.4,
  compThdReductionDanger: 0.15,
  /** 보상 전 역률이 이보다 낮을 때만 개선폭을 본다 */
  compPfMaxBefore: 90,
  /** 역률 개선폭 (%p) */
  compPfGainWarn: 3,
  compPfGainDanger: 1,

  /** 팬 정지 판정. RPM이든 m/s든 도는 팬은 이 값을 훨씬 넘는다 */
  fanStopped: 0.5,
  /** 같은 시각 모듈 간 온도 편차 (°C) */
  moduleSpreadWarn: 10,
  moduleSpreadAlarm: 15,
  /** 운전 용량 / 총 용량 */
  capacitySaturatedRatio: 0.95,
} as const;
