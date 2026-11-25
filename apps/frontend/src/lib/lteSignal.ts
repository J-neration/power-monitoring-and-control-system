import { isCommLost } from "./commStatus";

/**
 * none       — 통신 자체가 없음 (한 번도 못 받았거나 30분 넘게 끊김)
 * unmeasured — 데이터는 받았지만 신호 값이 없음 (CSQ 99 = 모뎀이 아직 못 잼 등)
 */
export type LteSignalGrade =
  | "excellent"
  | "fair"
  | "poor"
  | "critical"
  | "unmeasured"
  | "none";

export type LteSignalInfo = {
  grade: LteSignalGrade;
  bars: number;
  label: string;
  rsrp?: number;
  csq?: number;
};

const GRADE_META: Record<
  LteSignalGrade,
  { bars: number; label: string }
> = {
  excellent: { bars: 4, label: "양호" },
  fair: { bars: 3, label: "보통" },
  poor: { bars: 2, label: "약함" },
  critical: { bars: 1, label: "매우 약함" },
  unmeasured: { bars: 0, label: "측정 안 됨" },
  none: { bars: 0, label: "수신 없음" },
};

function gradeFromRsrp(rsrp: number): LteSignalGrade {
  if (rsrp >= -90) return "excellent";
  if (rsrp >= -105) return "fair";
  if (rsrp >= -115) return "poor";
  return "critical";
}

function gradeFromCsq(csq: number): LteSignalGrade {
  if (csq >= 20) return "excellent";
  if (csq >= 15) return "fair";
  if (csq >= 10) return "poor";
  if (csq >= 0 && csq <= 9) return "critical";
  return "unmeasured";
}

/** RSRP 우선, 없으면 CSQ로 LTE 신호 등급 판정 */
export function getLteSignalInfo(
  rsrp?: number | null,
  csq?: number | null,
  offline = false,
): LteSignalInfo {
  if (offline) {
    return { grade: "none", ...GRADE_META.none };
  }

  const hasRsrp = rsrp != null && Number.isFinite(rsrp);
  const hasCsq = csq != null && Number.isFinite(csq) && csq !== 99;

  if (!hasRsrp && !hasCsq) {
    return { grade: "unmeasured", ...GRADE_META.unmeasured };
  }

  const grade = hasRsrp
    ? gradeFromRsrp(rsrp)
    : gradeFromCsq(csq as number);
  const meta = GRADE_META[grade];

  return {
    grade,
    bars: meta.bars,
    label: meta.label,
    ...(hasRsrp ? { rsrp } : {}),
    ...(hasCsq ? { csq: csq as number } : {}),
  };
}

/**
 * LTE 표시에서 "통신 없음"으로 볼지. 마지막 수신 시각만 본다.
 * 모듈 상태(전부 꺼짐/미설치 → 장비 상태 offline)는 통신과 무관하므로 보지 않는다.
 */
export function isLteOffline(lastSeenAt?: string | null, now = Date.now()): boolean {
  if (!lastSeenAt) return true;
  return isCommLost(lastSeenAt, now);
}

export function formatLteSignalDetail(info: LteSignalInfo): string | null {
  const parts: string[] = [];
  if (info.rsrp != null) parts.push(`RSRP ${info.rsrp}`);
  if (info.csq != null) parts.push(`CSQ ${info.csq}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatLastSeen(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
