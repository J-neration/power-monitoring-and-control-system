import path from "node:path";
import { config } from "dotenv";
import bcrypt from "bcryptjs";

// prisma/seed.ts → 한 단계 위가 apps/backend/ (env 파일들이 위치한 곳)
const appDir = path.resolve(import.meta.dirname, "..");
const nodeEnv = process.env.NODE_ENV ?? "development";

for (const file of [
  ".env",
  ".env.local",
  `.env.${nodeEnv}`,
  `.env.${nodeEnv}.local`,
]) {
  config({ path: path.resolve(appDir, file), override: true });
}
import { PrismaClient } from "./generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  siteRegistry,
  type DeviceTelemetry,
} from "../src/data/deviceRegistry.js";

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

/** 온도·팬·용량 필드 — TelemetryRecord 시드와 동일한 공식 (h = 시뮬레이션 시각 0~24) */
function capacityAndThermalAtHour(
  installationId: string,
  d: DeviceTelemetry,
  h: number,
) {
  const phase = devicePhase(installationId);
  const totalCap = d.capacity ?? 200;
  const wTemp = wave(h, phase + 3.0, 0.04);
  const areaBase = [34, 36, 35, 33];
  const modBase = [40, 44, 42, 39, 43, 41];
  const fanBase = [7.5, 8.8];
  const opRatio =
    0.6 + 0.3 * Math.abs(Math.sin((h / 24) * 2 * Math.PI + phase));
  const opCap = r(totalCap * opRatio, 1);
  const rpRatio =
    0.65 + 0.2 * Math.abs(Math.sin((h / 24) * 2 * Math.PI + phase + 1));
  const rpCap = r(opCap * rpRatio, 1);
  const margin = r(totalCap - opCap, 1);
  return {
    areaTemp: areaBase.map((b) => r(b * wTemp, 1)),
    moduleTemp: modBase.map((b) => r(b * wTemp, 1)),
    fanSpeed: fanBase.map((b) => r(b * wTemp, 1)),
    totalCapacity: totalCap,
    operatingCapacity: opCap,
    reactivePowerCapacity: rpCap,
    availableMargin: margin,
  };
}

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
        model: d?.model ?? "paf",
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
        ...(d
          ? capacityAndThermalAtHour(inst.id, d, 24)
          : {
              areaTemp: [] as number[],
              moduleTemp: [] as number[],
              fanSpeed: [] as number[],
              totalCapacity: 200,
              operatingCapacity: null as number | null,
              reactivePowerCapacity: null as number | null,
              availableMargin: null as number | null,
            }),
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

      const records = Array.from({ length: 24 }, (_, i) => {
        const hoursAgo = 23 - i;
        const t = new Date(now.getTime() - hoursAgo * 3600 * 1000);
        const h = 24 - hoursAgo; // 시간 축 (0~24)

        const wV = wave(h, phase, 0.01);
        const wI = wave(h, phase + 1.0, 0.06);
        const wTHD = wave(h, phase + 2.0, 0.08);
        const wPF = wave(h, phase + 0.5, 0.015);

        const thermalCap = capacityAndThermalAtHour(inst.id, d, h);

        return {
          installationId: inst.id,
          recordedAt: t,
          moduleStatus: d.moduleStatus ?? [],
          numOfMods: d.numOfMods ?? 0,
          vL1: d.vL1 != null ? r(d.vL1 * wV) : null,
          vL2: d.vL2 != null ? r(d.vL2 * wV) : null,
          vL3: d.vL3 != null ? r(d.vL3 * wV) : null,
          gridCurrentL1:
            d.gridCurrentL1 != null ? r(d.gridCurrentL1 * wI) : null,
          gridCurrentL2:
            d.gridCurrentL2 != null ? r(d.gridCurrentL2 * wI) : null,
          gridCurrentL3:
            d.gridCurrentL3 != null ? r(d.gridCurrentL3 * wI) : null,
          loadCurrentL1:
            d.loadCurrentL1 != null ? r(d.loadCurrentL1 * wI) : null,
          loadCurrentL2:
            d.loadCurrentL2 != null ? r(d.loadCurrentL2 * wI) : null,
          loadCurrentL3:
            d.loadCurrentL3 != null ? r(d.loadCurrentL3 * wI) : null,
          loadCurrentTHDL1:
            d.loadCurrentTHDL1 != null ? r(d.loadCurrentTHDL1 * wTHD) : null,
          loadCurrentTHDL2:
            d.loadCurrentTHDL2 != null ? r(d.loadCurrentTHDL2 * wTHD) : null,
          loadCurrentTHDL3:
            d.loadCurrentTHDL3 != null ? r(d.loadCurrentTHDL3 * wTHD) : null,
          gridCurrentTHDL1:
            d.gridCurrentTHDL1 != null ? r(d.gridCurrentTHDL1 * wTHD) : null,
          gridCurrentTHDL2:
            d.gridCurrentTHDL2 != null ? r(d.gridCurrentTHDL2 * wTHD) : null,
          gridCurrentTHDL3:
            d.gridCurrentTHDL3 != null ? r(d.gridCurrentTHDL3 * wTHD) : null,
          tpf1: d.tpf1 != null ? Math.min(100, r(d.tpf1 * wPF, 4)) : null,
          tpf2: d.tpf2 != null ? Math.min(100, r(d.tpf2 * wPF, 4)) : null,
          dpf1: d.dpf1 != null ? Math.min(100, r(d.dpf1 * wPF, 4)) : null,
          dpf2: d.dpf2 != null ? Math.min(100, r(d.dpf2 * wPF, 4)) : null,
          uncompP: d.uncompP != null ? r(d.uncompP * wI, 0) : null,
          compP: d.compP != null ? r(d.compP * wI, 0) : null,
          uncompQ: d.uncompQ != null ? r(d.uncompQ * wI, 0) : null,
          compQ: d.compQ != null ? r(d.compQ * wI, 0) : null,
          uncompS: d.uncompS != null ? r(d.uncompS * wI, 0) : null,
          compS: d.compS != null ? r(d.compS * wI, 0) : null,
          uncompH: d.uncompH != null ? r(d.uncompH * wI, 0) : null,
          compH: d.compH != null ? r(d.compH * wI, 0) : null,
          ...thermalCap,
        };
      });

      await prisma.telemetryRecord.createMany({ data: records });
      console.log(`  ✓ ${inst.id}: 24h 레코드 ${records.length}개 생성`);
    }
  }

  console.log(`\nSeeded ${siteRegistry.length} sites successfully.`);

  // ── 초기 ADMIN 계정 ──────────────────────────────
  const adminUsername = "admin";
  const existing = await prisma.user.findUnique({
    where: { username: adminUsername },
  });
  if (!existing) {
    const passwordHash = await bcrypt.hash("abc123", 12);
    await prisma.user.create({
      data: { username: adminUsername, passwordHash, role: "ADMIN" },
    });
    console.log(`ADMIN 계정 생성: ${adminUsername} / abc123  ← 변경 필요`);
  } else {
    console.log(`ADMIN 계정 이미 존재: ${adminUsername} — 스킵`);
  }

  // ── DEV 테스트 계정 ───────────────────────────────
  type DevUser = { username: string; password: string; role: "CLIENT" | "SITE" | "ADMIN"; clientKey?: string; siteId?: string };
  const devUsers: DevUser[] = [
    { username: "datacenteradmin", password: "test1234", role: "CLIENT", clientKey: "datacenter" },
    { username: "lotte",           password: "test1234", role: "CLIENT", clientKey: "lotte" },
  ];

  for (const u of devUsers) {
    const found = await prisma.user.findUnique({ where: { username: u.username } });
    if (!found) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      await prisma.user.create({
        data: {
          username: u.username,
          passwordHash,
          role: u.role,
          clientKey: u.clientKey ?? null,
          siteId: u.siteId ?? null,
        },
      });
      console.log(`DEV 계정 생성: ${u.username} / ${u.password}  (${u.role}, clientKey=${u.clientKey ?? "-"})`);
    } else {
      // role·clientKey 등이 잘못 설정된 경우를 대비해 항상 동기화
      await prisma.user.update({
        where: { username: u.username },
        data: {
          role: u.role,
          clientKey: u.clientKey ?? null,
          siteId: u.siteId ?? null,
        },
      });
      console.log(`DEV 계정 동기화: ${u.username}  (${u.role}, clientKey=${u.clientKey ?? "-"})`);
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
