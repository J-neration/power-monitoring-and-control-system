import "dotenv/config";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deviceRegistry } from "../src/data/deviceRegistry.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL
  })
});

const seed = async () => {
  const now = new Date();

  for (const entry of deviceRegistry) {
    const status = entry.status ?? "offline";

    await prisma.device.upsert({
      where: { id: entry.id },
      update: {
        name: entry.name,
        location: entry.location,
        status,
        lastSeenAt: now
      },
      create: {
        id: entry.id,
        name: entry.name,
        location: entry.location,
        status,
        lastSeenAt: now,
        lastValue: 0,
        lastIp: "unknown",
        vL1: 0,
        vL2: 0,
        vL3: 0,
        iL1: 0,
        iL2: 0,
        iL3: 0
      }
    });
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
