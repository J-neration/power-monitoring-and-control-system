import nodemailer from "nodemailer";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string[];
};

type MailTransport = ReturnType<typeof nodemailer.createTransport>;

let transporter: MailTransport | null = null;
let transporterKey = "";
let missingConfigWarned = false;

const readConfig = (): SmtpConfig | null => {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const to = (process.env.ALERT_EMAIL_TO ?? "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const port = Number(process.env.SMTP_PORT ?? 587);
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!host || !user || !pass.trim() || !from || to.length === 0 || !Number.isFinite(port)) {
    return null;
  }
  return { host, port, user, pass, from, to };
};

export const isAlertMailConfigured = () => readConfig() !== null;

/** 개발 서버 메일 본문·제목에만 붙인다. 운영 주소(pqms.co.kr, app.pqms.co.kr)에는 붙이지 않는다. */
export const DEV_ALERT_MAIL_NOTICE =
  "이 메일은 DEV 사이트에서 발송된 테스트용 알림입니다. 운영 설비가 아닙니다.";

const hostLooksLikeDev = (origin: string) => {
  const trimmed = origin.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host.split(".").some((label) => label === "dev" || label.endsWith("-dev"));
  } catch {
    return false;
  }
};

export const isDevAlertSite = (
  env: { PQMS_ALERT_ENV?: string; NODE_ENV?: string; FRONTEND_ORIGIN?: string } = process.env,
) => {
  const flag = (env.PQMS_ALERT_ENV ?? "").trim().toLowerCase();
  if (flag === "prod" || flag === "production") return false;
  if (flag === "dev" || flag === "development") return true;
  if ((env.NODE_ENV ?? "").trim() === "development") return true;
  return (env.FRONTEND_ORIGIN ?? "").split(",").some(hostLooksLikeDev);
};

export const applyDevAlertNotice = <T extends { subject: string; text: string; html?: string }>(
  mail: T,
  env: { PQMS_ALERT_ENV?: string; NODE_ENV?: string; FRONTEND_ORIGIN?: string } = process.env,
): T => {
  if (!isDevAlertSite(env)) return mail;
  const banner = `<div style="padding:12px 24px;background:#fef3c7;color:#92400e;font-size:13px;line-height:1.5;">${DEV_ALERT_MAIL_NOTICE}</div>`;
  const html = mail.html
    ? mail.html.includes("<body")
      ? mail.html.replace(/<body([^>]*)>/, `<body$1>${banner}`)
      : `${banner}${mail.html}`
    : mail.html;
  return {
    ...mail,
    subject: `[DEV 테스트] ${mail.subject}`,
    text: `${DEV_ALERT_MAIL_NOTICE}\n\n${mail.text}`,
    ...(html !== undefined ? { html } : {}),
  };
};

const getTransporter = (cfg: SmtpConfig) => {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    transporterKey = key;
  }
  return transporter;
};

/** SMTP 가 없으면 조용히 건너뛴다. 실패는 호출자가 로그한다. */
export const sendAlertMail = async (mail: {
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> => {
  const cfg = readConfig();
  if (!cfg) {
    if (!missingConfigWarned) {
      missingConfigWarned = true;
      console.warn(
        "admin alert mail skipped: SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO must all be set on this service",
      );
    }
    return false;
  }
  const notice = applyDevAlertNotice(mail);
  await getTransporter(cfg).sendMail({
    from: `"PQMS" <${cfg.from}>`,
    to: cfg.to,
    subject: notice.subject,
    text: notice.text,
    ...(notice.html ? { html: notice.html } : {}),
  });
  return true;
};
