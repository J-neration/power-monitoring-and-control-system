/** HMI moduleStatus: 0 standby · 1 start · 2 running · 3 fault · 4 offline */
const STATUS_LABEL: Record<number, string> = {
  0: "대기",
  1: "기동",
  2: "가동",
  3: "이상",
  4: "오프라인",
};

/** 출고검사는 시험 중 상태가 자주 바뀌므로 메일을 보내지 않는다. */
const ALERT_MAIL_EXCLUDED_SITE_IDS = new Set([
  "testing", // 출고검사
]);

export const isAlertMailExcludedSite = (siteId: string | null | undefined) =>
  !!siteId && ALERT_MAIL_EXCLUDED_SITE_IDS.has(siteId);

export type ModuleStatusAlert = {
  /** 0-based module index (모듈 1 = 0) */
  moduleIndex: number;
  /** 배열에서 빠진 자리는 null */
  from: number | null;
  to: number | null;
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
 * 이전 상태를 알고 있을 때만 알린다. 첫 수신은 제외.
 * 값이 하나라도 달라지면 방향과 상관없이 알린다.
 */
export const detectModuleStatusAlerts = (
  previous: number[] | null | undefined,
  next: number[] | null | undefined,
): ModuleStatusAlert[] => {
  if (!previous?.length || !next?.length) return [];

  const alerts: ModuleStatusAlert[] = [];
  const len = Math.max(previous.length, next.length);
  for (let i = 0; i < len; i++) {
    const from = i < previous.length ? previous[i]! : null;
    const to = i < next.length ? next[i]! : null;
    if (from === to) continue;
    alerts.push({ moduleIndex: i, from, to });
  }
  return alerts;
};

const slotLabel = (code: number | null) => (code == null ? "없음" : statusLabel(code));

export const statusAlertLine = (alert: ModuleStatusAlert, note?: string | null): AlertLine => {
  const n = alert.moduleIndex + 1;
  const toLabel = slotLabel(alert.to);
  const detailText = note?.trim();
  const headline = alert.to == null ? `모듈 ${n} 없음` : `모듈 ${n} ${toLabel}`;
  return {
    summary: headline,
    headline,
    change: `${slotLabel(alert.from)} → ${toLabel}`,
    ...(detailText ? { note: detailText } : {}),
  };
};

/** 통신 끊김 한 건. 다시 수신되기 전까지 호출자는 한 번만 부른다. */
export const commLostAlertLine = (lastSeenAt: Date, staleAfterMinutes: number): AlertLine => ({
  summary: "통신 끊김",
  headline: "통신 끊김",
  change: `마지막 수신 ${formatWhen(lastSeenAt)} (KST) 이후 ${staleAfterMinutes}분 이상 응답 없음`,
});

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
  const subject = `[PQMS] ${place || input.installationId} — ${subjectBit}`;
  const when = formatWhen(input.at);
  const siteName = input.siteName || "-";
  const label = input.installationLabel || "-";
  const region = input.region?.trim() || "-";

  const text = [
    "PQMS 설비 알림",
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
    "모듈 상태가 바뀔 때마다 보냅니다. 통신 끊김은 다시 수신될 때까지 한 번만 보냅니다.",
    "같은 이상 내용은 1시간 동안 반복하지 않습니다.",
    "PQMS 대시보드에서 해당 설비의 모듈 상태와 이상 이력을 확인해 주십시오.",
    "",
    "본 메일은 PQMS가 자동으로 발송했습니다.",
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
    <div style="padding:16px 24px;background:#0f172a;color:#ffffff;font-size:14px;letter-spacing:0.04em;">PQMS 설비 알림</div>
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
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">모듈 상태가 바뀔 때마다 보냅니다. 통신 끊김은 다시 수신될 때까지 한 번만 보냅니다. 같은 이상 내용은 1시간 동안 반복하지 않습니다. PQMS 대시보드에서 해당 설비의 모듈 상태와 이상 이력을 확인해 주십시오.</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
};
