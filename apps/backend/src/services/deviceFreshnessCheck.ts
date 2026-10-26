import type { FastifyBaseLogger } from "fastify";
import { COMM_LOST_AFTER_MS } from "../lib/commStatus.js";
import { prisma } from "../lib/prisma.js";

/**
 * 장비 수신 끊김 감시. 10분마다 "최근 N일 안에 수신한 적이 있는데 통신 끊김 기준(기본 30분)을 넘긴 장비"를
 * 세어 한 줄 로그로 남긴다. CloudWatch 로그 지표 필터가 이 줄의 `stale` 값을 지표로 만들고, 1 이상이면
 * 알람 메일을 보낸다 (infra/terraform/modules/ops-alarms). 어느 장비인지는 같은 줄의 `staleIds` 로 본다.
 *
 * 최근 N일 조건은 오래전에 철거·교체된 장비가 영원히 알람을 울리지 않게 하기 위한 것이다.
 * 기본은 꺼짐. 알람을 연결한 환경에서만 DEVICE_FRESHNESS_CHECK_ENABLED=true 로 켠다.
 *
 * DEVICE_FRESHNESS_CHECK_ENABLED=false
 * DEVICE_FRESHNESS_ACTIVE_DAYS=7
 * DEVICE_STALE_AFTER_MINUTES=30      화면의 "통신 끊김"(commStatus)과 같은 기준
 */

const TICK_MS = 10 * 60 * 1000;

export type FreshnessConfig = {
  enabled: boolean;
  activeWindowMs: number;
  staleAfterMs: number;
};

export function freshnessConfigFrom(env: Record<string, string | undefined>): FreshnessConfig {
  const flag = (env.DEVICE_FRESHNESS_CHECK_ENABLED ?? "").trim().toLowerCase();
  const days = Number.parseInt(env.DEVICE_FRESHNESS_ACTIVE_DAYS ?? "", 10);
  const minutes = Number.parseInt(env.DEVICE_STALE_AFTER_MINUTES ?? "", 10);
  return {
    enabled: flag === "1" || flag === "true" || flag === "yes" || flag === "on",
    activeWindowMs: (Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 7) * 86_400_000,
    staleAfterMs:
      Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 24 * 60) * 60_000 : COMM_LOST_AFTER_MS,
  };
}

export type FreshnessReport = { active: number; stale: number; staleIds: string[] };

/** `devices` 는 활성 기간 안에 수신한 장비들. 끊김 기준을 넘긴 것만 고른다. */
export function findStaleDevices(
  devices: Array<{ installationId: string; lastSeenAt: Date | null }>,
  now: number,
  staleAfterMs: number,
): FreshnessReport {
  const staleIds = devices
    .filter((d) => d.lastSeenAt != null && now - d.lastSeenAt.getTime() >= staleAfterMs)
    .map((d) => d.installationId)
    .sort();
  return { active: devices.length, stale: staleIds.length, staleIds };
}

export async function checkDeviceFreshness(cfg: FreshnessConfig, now = Date.now()): Promise<FreshnessReport> {
  const devices = await prisma.device.findMany({
    where: { lastSeenAt: { gte: new Date(now - cfg.activeWindowMs) } },
    select: { installationId: true, lastSeenAt: true },
  });
  return findStaleDevices(devices, now, cfg.staleAfterMs);
}

/** 프로세스 안 타이머. 꺼져 있으면 아무것도 하지 않는다. */
export function startDeviceFreshnessCheck(log: FastifyBaseLogger): () => void {
  const cfg = freshnessConfigFrom(process.env);
  if (!cfg.enabled) return () => {};

  const tick = async () => {
    try {
      const report = await checkDeviceFreshness(cfg);
      // 로그 지표 필터가 msg 와 stale 필드로 지표를 만든다. 이름을 바꾸면 ops-alarms 필터도 바꿀 것.
      log.info(report, "device freshness");
    } catch (error) {
      log.error(error, "device freshness check failed");
    }
  };

  const starter = setTimeout(() => void tick(), 30_000);
  const timer = setInterval(() => void tick(), TICK_MS);
  starter.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(starter);
    clearInterval(timer);
  };
}
