import { PrismaClient } from "../../prisma/generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveDeviceStatus } from "./deviceService.js";
import type { UserContext } from "../modules/auth/auth.types.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

/* ─── 권한별 Site WHERE 필터 ──────────────────────── */
const siteWhereFilter = (ctx: UserContext) => {
  if (ctx.role === "ADMIN") return {};
  if (ctx.role === "CLIENT") return { client: ctx.clientKey };
  return { id: ctx.siteId }; // SITE
};

/* ─── 권한 검사: 특정 siteId에 접근 가능한지 ─────── */
const canAccessSite = (ctx: UserContext, siteClient: string, siteId: string) => {
  if (ctx.role === "ADMIN") return true;
  if (ctx.role === "CLIENT") return siteClient === ctx.clientKey;
  return siteId === ctx.siteId;
};

const deriveSiteStatus = (devices: { status: string }[]) => {
  if (devices.some((d) => d.status === "fault")) return "fault";
  if (devices.some((d) => d.status === "standby" || d.status === "start"))
    return "standby";
  if (devices.length === 0) return "offline";
  return "running";
};

export const siteService = {
  /* ─── 메인페이지용: Site 요약 목록 ─────────────── */
  list: async (ctx: UserContext) => {
    const sites = await prisma.site.findMany({
      where: siteWhereFilter(ctx),
      include: {
        installations: {
          include: { device: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return sites.map((site) => {
      const enrichedInstallations = site.installations.map((inst) => ({
        id: inst.id,
        label: inst.label,
        device: {
          ...inst.device!,
          status: deriveDeviceStatus(inst.device!.moduleStatus) ?? "offline",
        },
      }));

      return {
        siteId: site.id,
        name: site.name,
        client: site.client,
        region: site.region,
        address: site.address,
        installationCount: site.installations.length,
        status: deriveSiteStatus(enrichedInstallations.map((i) => i.device)),
        installations: enrichedInstallations,
      };
    });
  },

  /* ─── 상세페이지용: Site + Installations + Device ─ */
  get: async (siteId: string, ctx: UserContext) => {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        installations: {
          include: { device: true },
          orderBy: { label: "asc" },
        },
      },
    });
    if (!site) return null;
    if (!canAccessSite(ctx, site.client, site.id)) return null; // 권한 없음 → null(404)

    return {
      ...site,
      installations: site.installations.map((inst) => ({
        ...inst,
        device: inst.device
          ? {
              ...inst.device,
              status: deriveDeviceStatus(inst.device.moduleStatus) ?? "offline",
            }
          : inst.device,
      })),
    };
  },
};
