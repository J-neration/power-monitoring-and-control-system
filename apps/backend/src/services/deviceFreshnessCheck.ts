import type { FastifyBaseLogger } from "fastify";
import { COMM_LOST_AFTER_MS } from "../lib/commStatus.js";
import { commLostAlertLine } from "../lib/moduleAlerts.js";
import { prisma } from "../lib/prisma.js";
import { notifyAdminAlerts } from "./adminAlertService.js";

/**
 * 장비 수신 끊김 감시. 1분마다 "최근 N일 안에 수신한 적이 있는데 통신 끊김 기준(기본 30분)을 넘긴 장비"를
 * 세어 한 줄 로그로 남긴다. CloudWatch 로그 지표 필터가 이 줄의 `stale` 값을 지표로 만들고, 1 이상이면
 * 알람 메일을 보낸다 (infra/terraform/modules/ops-alarms). 어느 장비인지는 같은 줄의 `staleIds` 로 본다.
 *
 * 끊긴 설비는 관리자 SMTP 메일(ALERT_EMAIL_TO)로도 보낸다. 프로세스가 올라올 때 이미 끊겨 있으면
 * 그 끊김에 대해 한 번 보내고, 이후에는 새로 끊길 때만 보낸다. 다시 수신되면 다음 끊김에 다시 보낸다.
 * prod·dev 모두 기본으로 켜져 있고, DEVICE_FRESHNESS_CHECK_ENABLED=false 일 때만 멈춘다.
 *
 * DEVICE_FRESHNESS_CHECK_ENABLED=true
 * DEVICE_FRESHNESS_ACTIVE_DAYS=7
 * DEVICE_STALE_AFTER_MINUTES=30      화면의 "통신 끊김"(commStatus)과 같은 기준
 */

const TICK_MS = 60 * 1000;

export type FreshnessConfig = {
  enabled: boolean;
  activeWindowMs: number;
  staleAfterMs: number;
};

export function freshnessConfigFrom(env: Record<string, string | undefined>): FreshnessConfig {
  const flag = (env.DEVICE_FRESHNESS_CHECK_ENABLED ?? "").trim().toLowerCase();
  const days = Number.parseInt(env.DEVICE_FRESHNESS_ACTIVE_DAYS ?? "", 10);
  const minutes = Number.parseInt(env.DEVICE_STALE_AFTER_MINUTES ?? "", 10);
  const disabled = flag === "0" || flag === "false" || flag === "no" || flag === "off";
  return {
    enabled: !disabled,
    activeWindowMs: (Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 7) * 86_400_000,
    staleAfterMs:
      Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 24 * 60) * 60_000 : COMM_LOST_AFTER_MS,
  };
}

export type FreshnessReport = { active: number; stale: number; staleIds: string[] };

export type StaleHit = { installationId: string; lastSeenAt: Date };

export type CommLostTrack = { seeded: boolean; alerted: Set<string> };

/** `devices` 는 활성 기간 안에 수신한 장비들. 끊김 기준을 넘긴 것만 고른다. */
export function findStaleDevices(
  devices: Array<{ installationId: string; lastSeenAt: Date | null }>,
  now: number,
  staleAfterMs: number,
): FreshnessReport {
  return classifyDevices(devices, now, staleAfterMs).report;
}

export function classifyDevices(
  devices: Array<{ installationId: string; lastSeenAt: Date | null }>,
  now: number,
  staleAfterMs: number,
): { report: FreshnessReport; hits: StaleHit[] } {
  const hits = devices
    .filter((d): d is { installationId: string; lastSeenAt: Date } =>
      d.lastSeenAt != null && now - d.lastSeenAt.getTime() >= staleAfterMs,
    )
    .map((d) => ({ installationId: d.installationId, lastSeenAt: d.lastSeenAt }))
    .sort((a, b) => a.installationId.localeCompare(b.installationId));
  return {
    report: { active: devices.length, stale: hits.length, staleIds: hits.map((hit) => hit.installationId) },
    hits,
  };
}

/**
 * 아직 메일을 보내지 않은 끊김만 고른다. 처음 볼 때도 이미 끊긴 설비를 포함한다.
 * 다시 수신되면 기억에서 빠져 다음 끊김에 다시 보낸다.
 */
export function planCommLostMails(
  hits: StaleHit[],
  track: CommLostTrack,
): { remember: string[]; notify: StaleHit[] } {
  const remember: string[] = [];
  const notify: StaleHit[] = [];
  for (const hit of hits) {
    if (track.seeded && track.alerted.has(hit.installationId)) remember.push(hit.installationId);
    else notify.push(hit);
  }
  return { remember, notify };
}

export async function checkDeviceFreshness(
  cfg: FreshnessConfig,
  now = Date.now(),
): Promise<{ report: FreshnessReport; hits: StaleHit[] }> {
  const devices = await prisma.device.findMany({
    where: { lastSeenAt: { gte: new Date(now - cfg.activeWindowMs) } },
    select: { installationId: true, lastSeenAt: true },
  });
  return classifyDevices(devices, now, cfg.staleAfterMs);
}

/** 프로세스 안 타이머. DEVICE_FRESHNESS_CHECK_ENABLED=false 이면 아무것도 하지 않는다. */
export function startDeviceFreshnessCheck(log: FastifyBaseLogger): () => void {
  const cfg = freshnessConfigFrom(process.env);
  if (!cfg.enabled) return () => {};

  let track: CommLostTrack = { seeded: false, alerted: new Set() };
  let loggedMissingConfig = false;
  const staleAfterMinutes = Math.max(1, Math.round(cfg.staleAfterMs / 60_000));

  const tick = async () => {
    try {
      const now = Date.now();
      const { report, hits } = await checkDeviceFreshness(cfg, now);
      // 로그 지표 필터가 msg 와 stale 필드로 지표를 만든다. 이름을 바꾸면 ops-alarms 필터도 바꿀 것.
      log.info(report, "device freshness");
      const planned = planCommLostMails(hits, track);
      const alerted = new Set(planned.remember);
      for (const hit of planned.notify) {
        try {
          const result = await notifyAdminAlerts({
            installationId: hit.installationId,
            at: new Date(now),
            lines: [commLostAlertLine(hit.lastSeenAt, staleAfterMinutes)],
          });
          if (result === "sent" || result === "skipped-site") {
            alerted.add(hit.installationId);
          } else if (result === "skipped-config" && !loggedMissingConfig) {
            loggedMissingConfig = true;
            log.warn(
              "comm lost mail skipped: SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO must all be set on this service",
            );
          }
        } catch (error) {
          log.warn({ err: error, installationId: hit.installationId }, "comm lost mail failed");
        }
      }
      track = { seeded: true, alerted };
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
