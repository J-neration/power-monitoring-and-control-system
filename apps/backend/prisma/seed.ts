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

// Deterministic wave: smooth sinusoidal variation over 24h
function wave(hour: number, phase: number, amp: number): number {
  return 1 + amp * Math.sin((hour / 24) * 2 * Math.PI + phase);
}

// Phase offset derived from device ID for uniqueness per device
function devicePhase(id: string): number {
  return (id.charCodeAt(id.length - 1) % 10) * 0.628;
}

const r = (v: number, decimals = 2) =>
  Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);

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
        // 온도 / 팬 속도 (기본 샘플값)
        areaTemp:   [35.2, 38.1, 36.7, 34.5],
        moduleTemp: [42.1, 45.3, 43.8, 41.2, 44.6, 43.0],
        fanSpeed:   [8.5, 9.2],
        // 용량 (capacity 기반 초기값)
        totalCapacity:         d?.capacity ?? 200,
        operatingCapacity:     r((d?.capacity ?? 200) * 0.75, 1),
        reactivePowerCapacity: r((d?.capacity ?? 200) * 0.75 * 0.78, 1),
        availableMargin:       r((d?.capacity ?? 200) * 0.25, 1),
      };

      await prisma.device.upsert({
        where: { installationId: inst.id },
        update: deviceData,
        create: { installationId: inst.id, ...deviceData },
      });

      // ── 24h TelemetryRecord 시드 ────────────────────────────────
      if (!d) continue;

      // 이미 시드 데이터가 있으면 스킵
      const existingCount = await prisma.telemetryRecord.count({
        where: { installationId: inst.id },
      });
      if (existingCount > 0) continue;

      const phase = devicePhase(inst.id);
      const totalCap = d.capacity ?? 200;

      const records = Array.from({ length: 24 }, (_, i) => {
        const hoursAgo = 23 - i;
        const t = new Date(now.getTime() - hoursAgo * 3600 * 1000);
        const h = 24 - hoursAgo; // 시간 축 (0~24)

        const wV = wave(h, phase, 0.01);
        const wI = wave(h, phase + 1.0, 0.06);
        const wTHD = wave(h, phase + 2.0, 0.08);
        const wPF = wave(h, phase + 0.5, 0.015);

        // 용량 (capacity) 계산
        const opRatio = 0.60 + 0.30 * Math.abs(Math.sin((h / 24) * 2 * Math.PI + phase));
        const opCap = r(totalCap * opRatio, 1);
        const rpRatio = 0.65 + 0.20 * Math.abs(Math.sin((h / 24) * 2 * Math.PI + phase + 1));
        const rpCap = r(opCap * rpRatio, 1);
        const margin = r(totalCap - opCap, 1);

        const wTemp = wave(h, phase + 3.0, 0.04);
        const areaBase = [34, 36, 35, 33];
        const modBase  = [40, 44, 42, 39, 43, 41];
        const fanBase  = [7.5, 8.8];

        return {
          installationId: inst.id,
          recordedAt: t,
          moduleStatus: d.moduleStatus ?? [],
          numOfMods: d.numOfMods ?? 0,
          vL1: d.vL1 != null ? r(d.vL1 * wV) : null,
          vL2: d.vL2 != null ? r(d.vL2 * wV) : null,
          vL3: d.vL3 != null ? r(d.vL3 * wV) : null,
          gridCurrentL1: d.gridCurrentL1 != null ? r(d.gridCurrentL1 * wI) : null,
          gridCurrentL2: d.gridCurrentL2 != null ? r(d.gridCurrentL2 * wI) : null,
          gridCurrentL3: d.gridCurrentL3 != null ? r(d.gridCurrentL3 * wI) : null,
          loadCurrentL1: d.loadCurrentL1 != null ? r(d.loadCurrentL1 * wI) : null,
          loadCurrentL2: d.loadCurrentL2 != null ? r(d.loadCurrentL2 * wI) : null,
          loadCurrentL3: d.loadCurrentL3 != null ? r(d.loadCurrentL3 * wI) : null,
          loadCurrentTHDL1: d.loadCurrentTHDL1 != null ? r(d.loadCurrentTHDL1 * wTHD) : null,
          loadCurrentTHDL2: d.loadCurrentTHDL2 != null ? r(d.loadCurrentTHDL2 * wTHD) : null,
          loadCurrentTHDL3: d.loadCurrentTHDL3 != null ? r(d.loadCurrentTHDL3 * wTHD) : null,
          gridCurrentTHDL1: d.gridCurrentTHDL1 != null ? r(d.gridCurrentTHDL1 * wTHD) : null,
          gridCurrentTHDL2: d.gridCurrentTHDL2 != null ? r(d.gridCurrentTHDL2 * wTHD) : null,
          gridCurrentTHDL3: d.gridCurrentTHDL3 != null ? r(d.gridCurrentTHDL3 * wTHD) : null,
          tpf1: d.tpf1 != null ? Math.min(1, r(d.tpf1 * wPF, 4)) : null,
          tpf2: d.tpf2 != null ? Math.min(1, r(d.tpf2 * wPF, 4)) : null,
          dpf1: d.dpf1 != null ? Math.min(1, r(d.dpf1 * wPF, 4)) : null,
          dpf2: d.dpf2 != null ? Math.min(1, r(d.dpf2 * wPF, 4)) : null,
          uncompP: d.uncompP != null ? r(d.uncompP * wI, 0) : null,
          compP: d.compP != null ? r(d.compP * wI, 0) : null,
          uncompQ: d.uncompQ != null ? r(d.uncompQ * wI, 0) : null,
          compQ: d.compQ != null ? r(d.compQ * wI, 0) : null,
          uncompS: d.uncompS != null ? r(d.uncompS * wI, 0) : null,
          compS: d.compS != null ? r(d.compS * wI, 0) : null,
          uncompH: d.uncompH != null ? r(d.uncompH * wI, 0) : null,
          compH: d.compH != null ? r(d.compH * wI, 0) : null,
          areaTemp:   areaBase.map((b) => r(b * wTemp, 1)),
          moduleTemp: modBase.map((b) => r(b * wTemp, 1)),
          fanSpeed:   fanBase.map((b) => r(b * wTemp, 1)),
          totalCapacity: totalCap,
          operatingCapacity: opCap,
          reactivePowerCapacity: rpCap,
          availableMargin: margin,
        };
      });

      await prisma.telemetryRecord.createMany({ data: records });
      console.log(`  ✓ ${inst.id}: 24h 레코드 ${records.length}개 생성`);
    }
  }

  console.log(`\nSeeded ${siteRegistry.length} sites successfully.`);

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
