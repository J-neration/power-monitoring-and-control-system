import { PrismaClient } from "../../prisma/generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

export type FaultInput = {
  module: number;
  desc: string;
};

export const faultService = {
  /** HMI POST /receiver 에서 faults 배열이 있을 때 일괄 저장 */
  saveFaults: async (params: {
    installationId: string;
    iccid?: string | null;
    faults: FaultInput[];
    occurredAt?: Date;
  }): Promise<void> => {
    if (params.faults.length === 0) return;
    const now = params.occurredAt ?? new Date();
    await prisma.faultEvent.createMany({
      data: params.faults.map((f) => ({
        installationId: params.installationId,
        iccid: params.iccid ?? null,
        module: f.module,
        desc: f.desc.slice(0, 48),
        occurredAt: now,
      })),
    });
  },

  /** GET /receiver/faults — iccid 또는 installationId로 최근 N건 조회 */
  getFaults: async (params: {
    iccid?: string;
    installationId?: string;
    limit?: number;
  }) => {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

    if (params.iccid) {
      return prisma.faultEvent.findMany({
        where: { iccid: params.iccid },
        orderBy: { occurredAt: "desc" },
        take: limit,
        select: { id: true, module: true, desc: true, occurredAt: true, installationId: true },
      });
    }

    if (params.installationId) {
      return prisma.faultEvent.findMany({
        where: { installationId: params.installationId },
        orderBy: { occurredAt: "desc" },
        take: limit,
        select: { id: true, module: true, desc: true, occurredAt: true, installationId: true },
      });
    }

    return [];
  },
};
