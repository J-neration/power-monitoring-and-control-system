import { PrismaClient } from "../../prisma/generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

/* =========================================================
 * 상태 요약 로직
 * ========================================================= */

const deriveSiteStatus = (devices: { status: string }[]) => {
  if (devices.some((d) => d.status === "fault")) return "fault";
  if (devices.some((d) => d.status === "standby" || d.status === "start"))
    return "standby";
  if (devices.length === 0) return "offline";
  return "running";
};

export const siteService = {
  /* =======================================================
   * 메인페이지용: Site 요약
   * ======================================================= */
  list: async () => {
    const sites = await prisma.site.findMany({
      include: {
        installations: {
          include: {
            device: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  
    return sites.map((site) => {
      // 🔐 명시적 assert: "우리 시스템에서는 device는 반드시 존재"
      const devices = site.installations.map((inst) => {
        if (!inst.device) {
          throw new Error(
            `Invariant violation: Installation ${inst.id} has no device`
          );
        }
        return inst.device;
      });
  
      return {
        siteId: site.id,
        name: site.name,
        region: site.region,
        address: site.address,
        installationCount: site.installations.length,
        status: deriveSiteStatus(devices),
        installations: site.installations.map((inst) => ({
          id: inst.id,
          label: inst.label,
          capacity: inst.capacity,
          device: inst.device!, 
        })),
      };
    });
  },
  
  /* =======================================================
   * 상세페이지용: Site + Installations + Device
   * ======================================================= */
  get: async (siteId: string) => {
    return prisma.site.findUnique({
      where: { id: siteId },
      include: {
        installations: {
          include: {
            device: true,
          },
          orderBy: { label: "asc" },
        },
      },
    });
  },
};
