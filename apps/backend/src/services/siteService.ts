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
      const enrichedInstallations = site.installations.map((inst) => {
        const devicePayload =
          inst.device != null
            ? {
                ...inst.device,
                status: deriveDeviceStatus(inst.device.moduleStatus) ?? "offline",
              }
            : null;
        return {
          id: inst.id,
          label: inst.label,
          ...(ctx.role === "ADMIN" ? { iccid: inst.iccid ?? null } : {}),
          device: devicePayload,
        };
      });

      const statusInputs = enrichedInstallations
        .map((i) => i.device)
        .filter((d): d is NonNullable<typeof d> => d != null);

      return {
        siteId: site.id,
        name: site.name,
        client: site.client,
        region: site.region,
        address: site.address,
        installationCount: site.installations.length,
        status: deriveSiteStatus(statusInputs),
        installations: enrichedInstallations,
      };
    });
  },

  /* ─── 현장 생성 ────────────────────────────────── */
  create: async (data: {
    id: string;
    name: string;
    client: string;
    region: string;
    address: string;
  }) => {
    return prisma.site.create({ data });
  },

  /* ─── 현장 삭제 (Installation/Device/Telemetry cascade) ─ */
  delete: async (siteId: string) => {
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) return false;
    await prisma.site.delete({ where: { id: siteId } });
    return true;
  },

  /* ─── 설치지점 생성 ─────────────────────────────── */
  createInstallation: async (data: {
    id?: string;
    siteId: string;
    label: string;
  }) => {
    const id = data.id?.trim() || undefined;
    return prisma.installation.create({
      data: { id: id ?? undefined, siteId: data.siteId, label: data.label },
    });
  },

  /* ─── 설치지점 삭제 (Device/Telemetry cascade) ─── */
  deleteInstallation: async (installationId: string) => {
    const inst = await prisma.installation.findUnique({ where: { id: installationId } });
    if (!inst) return false;
    await prisma.installation.delete({ where: { id: installationId } });
    return true;
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
      installations: site.installations.map((inst) => {
        const { iccid, ...instWithoutIccid } = inst;
        const base = ctx.role === "ADMIN" ? { ...inst } : { ...instWithoutIccid };
        return {
          ...base,
          device: inst.device
            ? {
                ...inst.device,
                status: deriveDeviceStatus(inst.device.moduleStatus) ?? "offline",
              }
            : inst.device,
        };
      }),
    };
  },
};
