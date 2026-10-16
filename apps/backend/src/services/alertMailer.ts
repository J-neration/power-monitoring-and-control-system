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
  if (!cfg) return false;
  await getTransporter(cfg).sendMail({
    from: `"PMCS" <${cfg.from}>`,
    to: cfg.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
  });
  return true;
};
