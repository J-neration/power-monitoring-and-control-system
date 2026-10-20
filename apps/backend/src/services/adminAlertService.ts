import { prisma } from "../lib/prisma.js";
import {
  buildAdminAlertMail,
  isAlertMailExcludedSite,
  type AlertLine,
} from "../lib/moduleAlerts.js";
import { sendAlertMail } from "./alertMailer.js";

export const notifyAdminAlerts = async (params: {
  installationId: string;
  lines: AlertLine[];
  at?: Date;
}): Promise<boolean> => {
  if (params.lines.length === 0) return false;

  const inst = await prisma.installation.findUnique({
    where: { id: params.installationId },
    select: { label: true, site: { select: { id: true, name: true, region: true } } },
  });
  if (isAlertMailExcludedSite(inst?.site.id)) return false;

  const mail = buildAdminAlertMail({
    siteName: inst?.site.name ?? "",
    installationLabel: inst?.label ?? "",
    installationId: params.installationId,
    region: inst?.site.region ?? "",
    at: params.at ?? new Date(),
    lines: params.lines,
  });
  return sendAlertMail(mail);
};
