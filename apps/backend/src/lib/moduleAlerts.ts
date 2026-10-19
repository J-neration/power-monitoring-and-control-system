/** HMI moduleStatus: 0 standby · 1 start · 2 running · 3 fault · 4 offline */
export const MODULE_STANDBY = 0;
export const MODULE_RUNNING = 2;
export const MODULE_FAULT = 3;
export const MODULE_OFFLINE = 4;

const STATUS_LABEL: Record<number, string> = {
  0: "대기",
  1: "기동",
  2: "가동",
  3: "이상",
  4: "오프라인",
};

/** 시험 중 상태가 자주 바뀌므로 메일을 보내지 않는 현장. */
const ALERT_MAIL_EXCLUDED_SITE_IDS = new Set([
  "testing", // 출고검사
  "prime-rnd-1", // 프라임 연구소
]);

export const isAlertMailExcludedSite = (siteId: string | null | undefined) =>
  !!siteId && ALERT_MAIL_EXCLUDED_SITE_IDS.has(siteId);

export type ModuleAlertKind = "offline" | "standby" | "fault";

export type ModuleStatusAlert = {
  /** 0-based module index (모듈 1 = 0) */
  moduleIndex: number;
  kind: ModuleAlertKind;
  from: number;
  to: number;
};

export type AlertLine = {
  /** 한 건일 때 제목에 붙는 짧은 문구 */
  summary: string;
  /** 본문 항목 제목. 예: 모듈 3 이상 */
  headline: string;
  /** 상태 변화. 예: 가동 → 이상 */
  change?: string;
  /** HMI가 보낸 이상 설명 */
  note?: string;
};

const statusLabel = (code: number) => STATUS_LABEL[code] ?? `코드 ${code}`;

/**
 * 이전 상태를 알고 있을 때만 변화를 알린다.
 * - 가동(2) → 오프라인(4)
 * - 가동(2) → 대기(0)
 * - 이상이 아닌 상태에서 이상(3)으로 진입
 */
export const detectModuleStatusAlerts = (
  previous: number[] | null | undefined,
  next: number[] | null | undefined,
): ModuleStatusAlert[] => {
  if (!previous?.length || !next?.length) return [];

  const alerts: ModuleStatusAlert[] = [];
  const len = Math.min(previous.length, next.length);
  for (let i = 0; i < len; i++) {
    const from = previous[i];
    const to = next[i];
    if (from === undefined || to === undefined || from === to) continue;

    if (from === MODULE_RUNNING && to === MODULE_OFFLINE) {
      alerts.push({ moduleIndex: i, kind: "offline", from, to });
    } else if (from === MODULE_RUNNING && to === MODULE_STANDBY) {
      alerts.push({ moduleIndex: i, kind: "standby", from, to });
    } else if (to === MODULE_FAULT && from !== MODULE_FAULT) {
      alerts.push({ moduleIndex: i, kind: "fault", from, to });
    }
  }
  return alerts;
};

export const statusAlertLine = (alert: ModuleStatusAlert, note?: string | null): AlertLine => {
  const n = alert.moduleIndex + 1;
  const toLabel = statusLabel(alert.to);
  const detailText = note?.trim();
  return {
    summary: `모듈 ${n} ${toLabel}`,
    headline: `모듈 ${n} ${toLabel}`,
    change: `${statusLabel(alert.from)} → ${toLabel}`,
    ...(detailText ? { note: detailText } : {}),
  };
};

/** 0-based 모듈 번호. desc 가 있으면 본문에 붙인다. */
export const faultAlertLine = (moduleIndex: number, desc?: string | null): AlertLine => {
  const n = moduleIndex + 1;
  const detailText = desc?.trim();
  return {
    summary: `모듈 ${n} 이상`,
    headline: `모듈 ${n} 이상`,
    ...(detailText ? { note: detailText } : {}),
  };
};

/** Modbus faultCode 는 1-based. */
export const faultCodeAlertLine = (faultCode: number, eventName?: string | null): AlertLine =>
  faultAlertLine(faultCode - 1, eventName);

const formatWhen = (at: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const lineText = (line: AlertLine, index: number) => {
  const rows = [`${index + 1}. ${line.headline}`];
  if (line.change) rows.push(`   상태: ${line.change}`);
  if (line.note) rows.push(`   내용: ${line.note}`);
  return rows.join("\n");
};

export const buildAdminAlertMail = (input: {
  siteName: string;
  installationLabel: string;
  installationId: string;
  region?: string;
  at: Date;
  lines: AlertLine[];
}): { subject: string; text: string; html: string } => {
  const place = [input.siteName, input.installationLabel].filter(Boolean).join(" ");
  const subjectBit =
    input.lines.length === 1
      ? input.lines[0]?.summary ?? "상태 변경"
      : `상태 변경 ${input.lines.length}건`;
  const subject = `[PMCS] ${place || input.installationId} — ${subjectBit}`;
  const when = formatWhen(input.at);
  const siteName = input.siteName || "-";
  const label = input.installationLabel || "-";
  const region = input.region?.trim() || "-";

  const text = [
    "PMCS 설비 알림",
    "",
    `${place || input.installationId}에서 확인이 필요한 상태 변화가 감지되었습니다.`,
    "",
    `발생 시각 : ${when} (KST)`,
    `지역      : ${region}`,
    `현장      : ${siteName}`,
    `설치 위치 : ${label}`,
    `설비 ID   : ${input.installationId}`,
    "",
    "[변경 내용]",
    ...input.lines.map(lineText),
    "",
    "같은 상태는 1시간 동안 중복 발송하지 않습니다.",
    "PMCS 대시보드에서 해당 설비의 모듈 상태와 이상 이력을 확인해 주십시오.",
    "",
    "본 메일은 PMCS가 자동으로 발송했습니다.",
  ].join("\n");

  const items = input.lines
    .map((line) => {
      const change = line.change
        ? `<div style="margin-top:4px;color:#334155;">상태: ${escapeHtml(line.change)}</div>`
        : "";
      const note = line.note
        ? `<div style="margin-top:4px;color:#334155;">내용: ${escapeHtml(line.note)}</div>`
        : "";
      return `<li style="margin:0 0 12px;"><strong>${escapeHtml(line.headline)}</strong>${change}${note}</li>`;
    })
    .join("");

  const row = (name: string, value: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#64748b;white-space:nowrap;">${name}</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(value)}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="padding:16px 24px;background:#0f172a;color:#ffffff;font-size:14px;letter-spacing:0.04em;">PMCS 설비 알림</div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(place || input.installationId)}에서 확인이 필요한 상태 변화가 감지되었습니다.</p>
      <table style="border-collapse:collapse;font-size:14px;line-height:1.5;">
        ${row("발생 시각", `${when} (KST)`)}
        ${row("지역", region)}
        ${row("현장", siteName)}
        ${row("설치 위치", label)}
        ${row("설비 ID", input.installationId)}
      </table>
      <h2 style="margin:24px 0 8px;font-size:14px;">변경 내용</h2>
      <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;">${items}</ol>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">같은 상태는 1시간 동안 중복 발송하지 않습니다. PMCS 대시보드에서 해당 설비의 모듈 상태와 이상 이력을 확인해 주십시오.</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
};
