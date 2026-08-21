/** HMI 텔레메트리 예상 주기 */
export const TELEMETRY_INTERVAL_MS = 10 * 60 * 1000;

/** 3주기(30분) 미수신 → 통신 끊김. 모듈 상태(대기/오프라인 등)는 덮어쓰지 않음 */
export const COMM_LOST_AFTER_MS = 3 * TELEMETRY_INTERVAL_MS;

/**
 * 한 번이라도 받은 뒤 주기를 넘기면 true.
 * 설치만 하고 미수신(`lastSeenAt` null)은 통신 끊김이 아니라 수신 없음.
 */
export function isCommLost(
  lastSeenAt?: Date | string | null,
  now = Date.now(),
): boolean {
  if (lastSeenAt == null || lastSeenAt === "") return false;
  const t =
    typeof lastSeenAt === "string"
      ? Date.parse(lastSeenAt)
      : lastSeenAt.getTime();
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  if (age < 0) return false;
  return age >= COMM_LOST_AFTER_MS;
}
