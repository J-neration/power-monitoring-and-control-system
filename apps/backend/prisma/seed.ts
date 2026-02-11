import "dotenv/config";
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
    // 1) Site upsert
    await prisma.site.upsert({
      where: { id: site.siteId },
      update: {
        name: site.name,
        region: site.region,
        address: site.address,
        updatedAt: now,
      },
      create: {
        id: site.siteId,
        name: site.name,
        region: site.region,
        address: site.address,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 2) Installations + 3) Device(telemetry) upsert
    for (const inst of site.installations) {
      await prisma.installation.upsert({
        where: { id: inst.id },
        update: {
          siteId: site.siteId,
          label: inst.label,
          ...(inst.capacity !== undefined ? { capacity: inst.capacity } : {}),
          updatedAt: now,
        },
        create: {
          id: inst.id,
          siteId: site.siteId,
          label: inst.label,
          ...(inst.capacity !== undefined ? { capacity: inst.capacity } : {}),
          createdAt: now,
          updatedAt: now,
        },
      });

      // Device(telemetry) row (latest snapshot placeholder)
      await prisma.device.upsert({
        where: { installationId: inst.id },
        update: {
          status: inst.status ?? "offline",
          lastSeenAt: now,
          lastValue: 0,
          lastIp: "unknown",
          moduleStatus: [],
          numOfMods: 0,
        },
        create: {
          installationId: inst.id,
          status: inst.status ?? "offline",
          lastSeenAt: now,
          lastValue: 0,
          lastIp: "unknown",
          moduleStatus: [],
          numOfMods: 0,
        },
      });
    }
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
