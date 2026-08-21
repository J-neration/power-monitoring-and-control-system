import { COMM_LOST_AFTER_MS } from "./commStatus";

/** @deprecated 통신 끊김은 COMM_LOST_AFTER_MS(30분) 사용 */
export const DATA_STALE_MS = COMM_LOST_AFTER_MS;

export function dataFreshness(lastSeenAt?: string | null): {
  text: string;
  stale: boolean;
} {
  if (!lastSeenAt) {
    return { text: "수신 없음", stale: true };
  }
  const age = Date.now() - Date.parse(lastSeenAt);
  if (!Number.isFinite(age) || age < 0) {
    return { text: "수신 없음", stale: true };
  }
  if (age >= DATA_STALE_MS) {
    const min = Math.floor(age / 60_000);
    return { text: `${min}분 전 수신`, stale: true };
  }
  const sec = Math.floor(age / 1000);
  if (sec < 60) return { text: `${sec}초 전`, stale: false };
  return { text: `${Math.floor(sec / 60)}분 전`, stale: false };
}
