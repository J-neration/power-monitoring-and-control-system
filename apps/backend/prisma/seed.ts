import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "./generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { siteRegistry } from "../src/data/deviceRegistry.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const seed = async () => {
  const now = new Date();

  for (const site of siteRegistry) {
    await prisma.site.upsert({
      where: { id: site.siteId },
      update: {
        name: site.name,
        client: site.client,
        region: site.region,
        address: site.address,
        updatedAt: now,
      },
      create: {
        id: site.siteId,
        name: site.name,
        client: site.client,
        region: site.region,
        address: site.address,
        createdAt: now,
        updatedAt: now,
      },
    });

    for (const inst of site.installations) {
      await prisma.installation.upsert({
        where: { id: inst.id },
        update: {
          siteId: site.siteId,
          label: inst.label,
          updatedAt: now,
        },
        create: {
          id: inst.id,
          siteId: site.siteId,
          label: inst.label,
          createdAt: now,
          updatedAt: now,
        },
      });

      const d = inst.device;
      const deviceData = {
        status: d?.status ?? inst.status ?? "offline",
        model: d?.model ?? "psvg",
        capacity: d?.capacity ?? 150,
        lastSeenAt: d?.lastSeenAt ? new Date(d.lastSeenAt) : now,
        lastValue: 0,
        lastIp: "unknown",
        moduleStatus: d?.moduleStatus ?? [],
        numOfMods: d?.numOfMods ?? 0,
        vL1: d?.vL1 ?? null,
        vL2: d?.vL2 ?? null,
        vL3: d?.vL3 ?? null,
        gridCurrentL1: d?.gridCurrentL1 ?? null,
        gridCurrentL2: d?.gridCurrentL2 ?? null,
        gridCurrentL3: d?.gridCurrentL3 ?? null,
        loadCurrentL1: d?.loadCurrentL1 ?? null,
        loadCurrentL2: d?.loadCurrentL2 ?? null,
        loadCurrentL3: d?.loadCurrentL3 ?? null,
        loadCurrentTHDL1: d?.loadCurrentTHDL1 ?? null,
        loadCurrentTHDL2: d?.loadCurrentTHDL2 ?? null,
        loadCurrentTHDL3: d?.loadCurrentTHDL3 ?? null,
        gridCurrentTHDL1: d?.gridCurrentTHDL1 ?? null,
        gridCurrentTHDL2: d?.gridCurrentTHDL2 ?? null,
        gridCurrentTHDL3: d?.gridCurrentTHDL3 ?? null,
        tpf1: d?.tpf1 ?? null,
        tpf2: d?.tpf2 ?? null,
        dpf1: d?.dpf1 ?? null,
        dpf2: d?.dpf2 ?? null,
        uncompP: d?.uncompP ?? null,
        compP: d?.compP ?? null,
        uncompQ: d?.uncompQ ?? null,
        compQ: d?.compQ ?? null,
        uncompS: d?.uncompS ?? null,
        compS: d?.compS ?? null,
        uncompH: d?.uncompH ?? null,
        compH: d?.compH ?? null,
      };

      await prisma.device.upsert({
        where: { installationId: inst.id },
        update: deviceData,
        create: { installationId: inst.id, ...deviceData },
      });
    }
  }

  console.log(`Seeded ${siteRegistry.length} sites successfully.`);

  // ── 초기 ADMIN 계정 ──────────────────────────────
  const adminUsername = "admin";
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing) {
    const passwordHash = await bcrypt.hash("abc123", 12);
    await prisma.user.create({
      data: { username: adminUsername, passwordHash, role: "ADMIN" },
    });
    console.log(`ADMIN 계정 생성: ${adminUsername} / abc123  ← 변경 필요`);
  } else {
    console.log(`ADMIN 계정 이미 존재: ${adminUsername} — 스킵`);
  }
};

seed()
  .catch((error) => {
    console.error("Prisma seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
