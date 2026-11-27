/**
 * HMI 보고 주기를 받은 기록에서 구한다 (10/30/60분 중 장비마다 다름).
 * 텔레메트리에 주기 값이 아직 없어서 시각 간격의 중앙값을 쓴다 — 백엔드 observedIntervalMs 와 같은 방식.
 */

type Timed = { recordedAt: string | Date; gap?: boolean };

/** 분 단위 보고 주기. 기록이 4건 미만이면 판단하지 않고 null. */
export function observedIntervalMinutes(points: readonly Timed[]): number | null {
  const times = points
    .filter((p) => !p.gap)
    .map((p) => new Date(p.recordedAt).getTime())
    .filter((t) => Number.isFinite(t));
  const diffs: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const d = times[i] - times[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length < 3) return null;
  diffs.sort((a, b) => a - b);
  const minutes = diffs[Math.floor(diffs.length / 2)] / 60_000;
  // HMI 시계가 몇 초~1분 흔들려도 "31분"처럼 보이지 않게 흔한 주기에 맞춘다.
  const snapped = COMMON_MINUTES.find((m) => Math.abs(minutes - m) <= m * 0.1);
  if (snapped) return snapped;
  const rounded = Math.round(minutes);
  return rounded >= 1 ? rounded : null;
}

const COMMON_MINUTES = [1, 5, 10, 15, 20, 30, 60];

/** 화면 표시용: "10분", "30분", "1시간". 모르면 "원본". */
export function intervalLabel(minutes: number | null): string {
  if (minutes == null) return "원본";
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes}분`;
}
