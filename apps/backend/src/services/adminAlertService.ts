import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  buildAdminAlertMail,
  isAlertMailExcludedSite,
  type AlertLine,
} from "../lib/moduleAlerts.js";
import { sendAlertMail } from "./alertMailer.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

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
