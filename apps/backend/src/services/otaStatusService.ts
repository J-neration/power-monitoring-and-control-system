import { prisma } from "../lib/prisma.js";

/**
 * HMI OTA 진행/결과 (HMI 저장소 docs/OTA_DEVELOPMENT_PLAN.md 10.2).
 * HMI 는 진행 단계마다, 재부팅 뒤에는 최종 결과를 서버가 받을 때까지 보낸다.
 */
export const OTA_STATUS_STATES = [
  "downloading",
  "verified",
  "installing",
  "confirmed",
  "rolled_back",
  "failed",
] as const;
export type OtaStatusState = (typeof OTA_STATUS_STATES)[number];

/** 화면을 바꾸는 OTA 의 단계 (HMI 저장소 docs/OTA_ASSET_PLAN.md 11.5 ①②③).
 *  backup = 지금 화면의 보관본 받기, screen = 새 화면 받기, code = 코드 받기·설치. */
export const OTA_STATUS_STAGES = ["backup", "screen", "code"] as const;
export type OtaStatusStage = (typeof OTA_STATUS_STAGES)[number];

/** 업데이트가 끝난 상태(웹에서 "진행 중" 표시를 끄는 기준). */
export const OTA_FINAL_STATES: readonly OtaStatusState[] = ["confirmed", "rolled_back", "failed"];

export type OtaStatusInput = {
  commandId?: string | null;
  state: OtaStatusState;
  percent?: number | null;
  fw?: string | null;
  target?: string | null;
  stage?: OtaStatusStage | null;
  error?: string | null;
};

export type OtaStatusEventDto = {
  id: string;
  commandId: string | null;
  state: string;
  percent: number | null;
  fw: string | null;
  target: string | null;
  stage: string | null;
  error: string | null;
  createdAt: Date;
};

const clean = (v: string | null | undefined, max: number) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};

export const otaStatusService = {
  async record(installationId: string, input: OtaStatusInput): Promise<OtaStatusEventDto> {
    const fw = clean(input.fw, 32);
    return prisma.$transaction(async (tx) => {
      const event = await tx.otaStatusEvent.create({
        data: {
          installationId,
          commandId: clean(input.commandId, 64),
          state: input.state,
          percent:
            typeof input.percent === "number" && Number.isFinite(input.percent)
              ? Math.max(0, Math.min(100, Math.trunc(input.percent)))
              : null,
          fw,
          target: clean(input.target, 32),
          stage: input.stage ?? null,
          error: clean(input.error, 120),
        },
      });
      // 버전은 보고 시점에 실행 중인 펌웨어. 행이 없으면(미수신 기기) 건드리지 않는다.
      if (fw) {
        await tx.device.updateMany({ where: { installationId }, data: { fwVersion: fw } });
      }
      return event;
    });
  },

  async list(installationId: string, limit = 30): Promise<OtaStatusEventDto[]> {
    return prisma.otaStatusEvent.findMany({
      where: { installationId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },
};
