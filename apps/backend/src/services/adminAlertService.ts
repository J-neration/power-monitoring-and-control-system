import { prisma } from "../lib/prisma.js";
import {
  buildAdminAlertMail,
  isAlertMailExcludedInstallation,
  isAlertMailExcludedSite,
  type AlertLine,
} from "../lib/moduleAlerts.js";
import { sendAlertMail } from "./alertMailer.js";

export type AdminAlertResult = "sent" | "empty" | "skipped-site" | "skipped-config";

export const notifyAdminAlerts = async (params: {
  installationId: string;
  lines: AlertLine[];
  at?: Date;
}): Promise<AdminAlertResult> => {
  if (params.lines.length === 0) return "empty";

  const inst = await prisma.installation.findUnique({
    where: { id: params.installationId },
    select: { label: true, site: { select: { id: true, name: true, region: true } } },
  });
  if (isAlertMailExcludedSite(inst?.site.id) || isAlertMailExcludedInstallation(params.installationId)) {
    return "skipped-site";
  }

  const mail = buildAdminAlertMail({
    siteName: inst?.site.name ?? "",
    installationLabel: inst?.label ?? "",
    installationId: params.installationId,
    region: inst?.site.region ?? "",
    at: params.at ?? new Date(),
    lines: params.lines,
  });
  return (await sendAlertMail(mail)) ? "sent" : "skipped-config";
};
