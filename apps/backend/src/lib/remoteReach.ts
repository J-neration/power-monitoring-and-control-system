import { prisma } from "./prisma.js";

/**
 * 원격 명령이 HMI 에 닿기까지 걸리는 시간 (HMI 저장소 docs/LTE_HARMONIC_DATA_PLAN.md 와 함께 볼 것).
 *
 * HMI 는 텔레메트리 POST 응답의 adminSessionActive 를 보고서야 명령 폴링(1분 간격)을 시작한다.
 * 텔레메트리 전송 주기는 HMI 가 설정 스냅샷 lte.postPeriodMin 으로 보고한다 (10/30/60분, 보고 전에는 10분).
 * 그래서 명령 유효시간과 원격 연결 창은 "전송 주기 + 여유" 보다 짧으면 안 된다.
 * 그렇지 않으면 60분 주기 장비에서는 HMI 가 명령을 보기 전에 만료된다.
 */
export const DEFAULT_POST_PERIOD_MIN = 10;

/** 텔레메트리가 늦게 나가는 경우(LTE 재연결 등)와 첫 폴링까지의 여유 */
export const REMOTE_REACH_MARGIN_MIN = 5;

/** 장비가 보고한 텔레메트리 전송 주기(분). 보고 전·잘못된 값이면 기본 10분 */
export async function devicePostPeriodMin(installationId: string): Promise<number> {
  if (!installationId) return DEFAULT_POST_PERIOD_MIN;
  const row = await prisma.installationDeviceSettings.findUnique({
    where: { installationId },
    select: { lte: true },
  });
  const lte = row?.lte;
  const v =
    lte && typeof lte === "object" && !Array.isArray(lte)
      ? (lte as Record<string, unknown>).postPeriodMin
      : undefined;
  return v === 10 || v === 30 || v === 60 ? v : DEFAULT_POST_PERIOD_MIN;
}

/** 이 주기의 장비에 명령이 닿는 데 필요한 최소 시간(ms) */
export const remoteReachMs = (periodMin: number): number =>
  (periodMin + REMOTE_REACH_MARGIN_MIN) * 60_000;
