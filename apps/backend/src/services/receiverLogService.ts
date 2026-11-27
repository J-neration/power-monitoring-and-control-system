import { iccidLookupCandidates, normalizeIccid } from "../lib/iccid.js";
import { prisma } from "../lib/prisma.js";

/**
 * HMI ↔ 서버 송수신 원문 기록 (어드민 "통신 로그" 창).
 * 저장 실패가 HMI 응답을 막으면 안 되므로 record 는 절대 throw 하지 않는다.
 */

/** 요청·응답 원문 한 칸 최대 길이. 텔레메트리 ~900B, ACK ~600B 라 보통 잘리지 않는다. */
export const RECEIVER_LOG_BODY_MAX = 16 * 1024;

export type ReceiverLogInput = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  iccid?: string | null;
  ip?: string | null;
  requestBody?: string | null;
  responseBody?: string | null;
};

export type ReceiverLogQuery = {
  /** 설치지점으로 거르기 (그 설치지점에 등록된 ICCID 로 찾는다) */
  installationId?: string;
  iccid?: string;
  /** 경로 (예: "/receiver/commands"). 쿼리(?iccid=…)는 무시하고 같은 경로만 */
  path?: string;
  /** 요청·응답 원문에서 찾을 글자 (예: "vL1", "Unauthorized") */
  q?: string;
  /** true 면 statusCode >= 400 만 */
  errorsOnly?: boolean;
  /** 이 id 보다 오래된 것 (다음 페이지) */
  beforeId?: number;
  limit?: number;
};

/** 요청 본문을 문자열로. 서버는 모든 본문을 string 으로 받지만 object/Buffer 도 받아 준다. */
export function bodyToText(body: unknown): string | null {
  if (body == null) return null;
  let text: string;
  if (typeof body === "string") text = body;
  else if (Buffer.isBuffer(body)) text = body.toString("utf-8");
  else {
    try {
      text = JSON.stringify(body);
    } catch {
      return null;
    }
  }
  return text.length === 0 ? null : clip(text);
}

export function clip(text: string, max = RECEIVER_LOG_BODY_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[잘림: 전체 ${text.length}자]`;
}

/** 본문(JSON) 또는 쿼리에서 ICCID 를 찾는다. 못 찾으면 null. */
export function pickIccid(body: unknown, query: unknown): string | null {
  const fromQuery = readIccid(query);
  if (fromQuery) return fromQuery;
  if (typeof body === "string") {
    const match = /"iccid"\s*:\s*"([^"]{1,40})"/.exec(body);
    return match ? normalizeIccid(match[1]).slice(0, 32) || null : null;
  }
  if (Buffer.isBuffer(body)) return pickIccid(body.toString("utf-8"), null);
  return readIccid(body);
}

function readIccid(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const iccid = (value as { iccid?: unknown }).iccid;
  if (typeof iccid !== "string") return null;
  const normalized = normalizeIccid(iccid);
  return normalized ? normalized.slice(0, 32) : null;
}

let warnedMissing = false;

export const receiverLogService = {
  async record(input: ReceiverLogInput, log?: { warn: (obj: unknown, msg: string) => void }) {
    try {
      await prisma.receiverLog.create({
        data: {
          method: input.method.slice(0, 8),
          path: input.path.slice(0, 300),
          statusCode: input.statusCode,
          durationMs: Math.max(0, Math.round(input.durationMs)),
          iccid: input.iccid ?? null,
          ip: input.ip?.slice(0, 64) ?? null,
          requestBody: input.requestBody ?? null,
          responseBody: input.responseBody ?? null,
        },
      });
    } catch (error) {
      // 마이그레이션 전(테이블 없음)이면 한 번만 알린다.
      if (!warnedMissing) {
        warnedMissing = true;
        log?.warn({ error }, "receiver log save failed (apply prisma migrate deploy?)");
      }
    }
  },

  async list(query: ReceiverLogQuery) {
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    // DB 에는 19자리, HMI 는 20자리(체크섬/F)를 보낼 수 있어 앞부분 일치로 찾는다.
    let iccidPrefix = query.iccid ? normalizeIccid(query.iccid) : "";
    if (query.installationId) {
      const inst = await prisma.installation.findUnique({
        where: { id: query.installationId },
        select: { iccid: true },
      });
      if (!inst?.iccid) return { logs: [], nextBeforeId: null };
      iccidPrefix = normalizeIccid(inst.iccid);
    }
    const rows = await prisma.receiverLog.findMany({
      where: {
        ...(iccidPrefix ? { iccid: { startsWith: iccidPrefix } } : {}),
        ...(query.path
          ? { OR: [{ path: query.path }, { path: { startsWith: `${query.path}?` } }] }
          : {}),
        ...(query.q
          ? {
              AND: [
                {
                  OR: [
                    { requestBody: { contains: query.q, mode: "insensitive" as const } },
                    { responseBody: { contains: query.q, mode: "insensitive" as const } },
                  ],
                },
              ],
            }
          : {}),
        ...(query.errorsOnly ? { statusCode: { gte: 400 } } : {}),
        ...(query.beforeId ? { id: { lt: query.beforeId } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit,
    });

    // 설치지점 이름을 붙인다 (ICCID → Installation).
    const iccids = [...new Set(rows.map((r) => r.iccid).filter((v): v is string => !!v))];
    const candidates = [...new Set(iccids.flatMap((v) => iccidLookupCandidates(v)))];
    const installations = candidates.length
      ? await prisma.installation.findMany({
          where: { iccid: { in: candidates } },
          select: { id: true, iccid: true, label: true, site: { select: { name: true } } },
        })
      : [];
    const byIccid = new Map(installations.map((i) => [i.iccid, i]));
    const findInstallation = (iccid: string | null) => {
      if (!iccid) return undefined;
      for (const c of iccidLookupCandidates(iccid)) {
        const hit = byIccid.get(c);
        if (hit) return hit;
      }
      return undefined;
    };

    const logs = rows.map((r) => {
      const inst = findInstallation(r.iccid);
      return {
        ...r,
        installationId: inst?.id ?? null,
        installationLabel: inst?.label ?? null,
        siteName: inst?.site?.name ?? null,
      };
    });
    const nextBeforeId = rows.length === limit ? rows[rows.length - 1].id : null;
    return { logs, nextBeforeId };
  },

  async purgeOlderThan(days: number, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const result = await prisma.receiverLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  },
};
