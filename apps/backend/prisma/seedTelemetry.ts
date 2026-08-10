/**
 * 테스트용 TelemetryRecord 시계열 데이터 생성 스크립트
 * 최근 24시간, 30분 간격 (48포인트) 를 대상 장치에 INSERT 합니다.
 *
 * 사용법: npm run db:seed:telemetry
 */
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "./generated/client/client.js";
import type { TelemetryRecordCreateManyInput } from "./generated/client/models/TelemetryRecord.js";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  siteRegistry,
  type DeviceTelemetry,
} from "../src/data/deviceRegistry.js";

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

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

// 난수 생성 (기준값 ± 진폭 범위 내에서 부드러운 사인파 + 노이즈)
function wave(base: number, amp: number, phase: number, noise: number, t: number) {
  const sin = Math.sin((t / 48) * 2 * Math.PI + phase);
  const rand = (Math.random() - 0.5) * 2 * noise;
  return Math.round((base + sin * amp + rand) * 10) / 10;
}

// 역률은 0~1 범위로 클램핑
function pfWave(base: number, amp: number, phase: number, t: number) {
  const v = base + Math.sin((t / 48) * 2 * Math.PI + phase) * amp;
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}

function registryWave(hour: number, phase: number, amp: number): number {
  return 1 + amp * Math.sin((hour / 24) * 2 * Math.PI + phase);
}

function devicePhase(id: string): number {
  return (id.charCodeAt(id.length - 1) % 10) * 0.628;
}

const r = (v: number, decimals = 2) =>
  Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);

function capacityAndThermalAtHour(
  installationId: string,
  d: DeviceTelemetry,
  h: number,
) {
  const phase = devicePhase(installationId);
  const totalCap = d.capacity ?? 200;
  const wTemp = registryWave(h, phase + 3.0, 0.04);
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

function findRegistryDevice(installationId: string): DeviceTelemetry | null {
  for (const site of siteRegistry) {
    const inst = site.installations.find((i) => i.id === installationId);
    if (inst?.device) return inst.device;
  }
  return null;
}

function buildRegistryRecords(
  installationId: string,
  d: DeviceTelemetry,
): TelemetryRecordCreateManyInput[] {
  const now = Date.now();
  const phase = devicePhase(installationId);
  const records: TelemetryRecordCreateManyInput[] = [];

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const minutesAgo = (TOTAL_POINTS - 1 - i) * INTERVAL_MINUTES;
    const recordedAt = new Date(now - minutesAgo * 60 * 1000);
    const h = (i / TOTAL_POINTS) * 24;

    const wV = registryWave(h, phase, 0.01);
    const wI = registryWave(h, phase + 1.0, 0.06);
    const wTHD = registryWave(h, phase + 2.0, 0.08);
    const wPF = registryWave(h, phase + 0.5, 0.015);
    const thermalCap = capacityAndThermalAtHour(installationId, d, h);

    records.push({
      installationId,
      recordedAt,
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
    });
  }

  return records;
}

// 테스트 데이터를 넣을 installationId 목록
const TARGETS = [
  "PSVG-SONGDO01",
  "PSVG-SONGDO02",
  "PSVG-RNDTEST5",
  "PSVG-CPN-AYG1-01",
];

const INTERVAL_MINUTES = 30;
const TOTAL_POINTS = 48; // 24시간

/** moduleStatus: 0=STANDBY 2=RUNNING 3=FAULT — 대부분 RUNNING, 약간 STANDBY, fault는 드물게 */
const TELEM_MODULE_PATTERNS: number[][] = [
  [2, 2, 2, 2, 2, 2],
  [2, 2, 2, 2, 2, 0],
  [2, 2, 2, 2, 0, 2],
  [2, 2, 2, 2, 2, 2],
  [2, 2, 0, 2, 2, 2],
  [2, 2, 2, 2, 2, 2],
  [2, 2, 2, 2, 2, 0],
  [2, 2, 2, 2, 2, 3], // 타깃 중 하나만 이 패턴(간헐 fault 1슬롯)
];

function buildLegacyRecords(installationId: string): TelemetryRecordCreateManyInput[] {
  const now = Date.now();
  const records: TelemetryRecordCreateManyInput[] = [];

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const recordedAt = new Date(now - (TOTAL_POINTS - i) * INTERVAL_MINUTES * 60 * 1000);

    const isRnd = installationId.startsWith("PSVG-RND");
    const vBase = isRnd ? 218 : 220.3;
    const iBase = isRnd ? 30 : 47;
    const thdBase = isRnd ? 8 : 3.2;
    const qBase = isRnd ? 45 : 60;

    const hour = recordedAt.getHours();
    const nightFactor = hour >= 0 && hour < 6 ? 0.6 : 1.0;

    const loadCurrentL1 = wave(iBase * nightFactor, 5, 0, 1, i);
    const loadCurrentL2 = wave(iBase * nightFactor, 4, 0.5, 1, i);
    const loadCurrentL3 = wave(iBase * nightFactor, 6, 1.0, 1, i);

    const gridCurrentL1 = wave(iBase * nightFactor + 2, 5, 0.1, 0.8, i);
    const gridCurrentL2 = wave(iBase * nightFactor + 1.5, 4, 0.6, 0.8, i);
    const gridCurrentL3 = wave(iBase * nightFactor + 2.5, 5.5, 1.1, 0.8, i);

    const loadCurrentTHDL1 = wave(thdBase, 1.5, 0, 0.3, i);
    const loadCurrentTHDL2 = wave(thdBase + 0.3, 1.2, 0.7, 0.3, i);
    const loadCurrentTHDL3 = wave(thdBase - 0.2, 1.4, 1.4, 0.3, i);

    const gridCurrentTHDL1 = wave(thdBase * 0.65, 0.8, 0.2, 0.2, i);
    const gridCurrentTHDL2 = wave(thdBase * 0.65 + 0.2, 0.7, 0.9, 0.2, i);
    const gridCurrentTHDL3 = wave(thdBase * 0.65 - 0.1, 0.9, 1.6, 0.2, i);

    const uncompQ = wave(qBase * nightFactor, 10, 0, 2, i);
    const compQ = wave(Math.max(15, uncompQ * 0.28), 4, 0.3, 1, i);

    const tpf1 = pfWave(0.84, 0.04, 0, i);
    const tpf2 = pfWave(0.97, 0.02, 0.2, i);
    const dpf1 = pfWave(0.85, 0.04, 0.1, i);
    const dpf2 = pfWave(0.98, 0.01, 0.3, i);

    const uncompS = wave(72 * nightFactor, 12, 0, 3, i);
    const compS = wave(64 * nightFactor, 10, 0.2, 2.5, i);
    const uncompP = wave(58 * nightFactor, 10, 0, 2.5, i);
    const compP = wave(55 * nightFactor, 9, 0.1, 2, i);
    const uncompH = wave(38 * nightFactor, 8, 0.5, 2, i);
    const compH = wave(26 * nightFactor, 3, 0.6, 1, i);

    records.push({
      installationId,
      recordedAt,
      moduleStatus: isRnd
        ? []
        : TELEM_MODULE_PATTERNS[TARGETS.indexOf(installationId) % TELEM_MODULE_PATTERNS.length],
      numOfMods: isRnd ? 0 : 6,
      vL1: wave(vBase, 1.5, 0, 0.3, i),
      vL2: wave(vBase + 0.8, 1.2, 0.5, 0.3, i),
      vL3: wave(vBase - 0.5, 1.3, 1.0, 0.3, i),
      loadCurrentL1,
      loadCurrentL2,
      loadCurrentL3,
      gridCurrentL1,
      gridCurrentL2,
      gridCurrentL3,
      loadCurrentTHDL1,
      loadCurrentTHDL2,
      loadCurrentTHDL3,
      gridCurrentTHDL1,
      gridCurrentTHDL2,
      gridCurrentTHDL3,
      tpf1,
      tpf2,
      dpf1,
      dpf2,
      uncompQ,
      compQ,
      uncompS,
      compS,
      uncompP,
      compP,
      uncompH,
      compH,
    });
  }

  return records;
}

async function main() {
  for (const installationId of TARGETS) {
    const inst = await prisma.installation.findUnique({
      where: { id: installationId },
    });
    if (!inst) {
      console.warn(`⚠ [${installationId}] Installation 없음 — seed.ts 먼저 실행하세요`);
      continue;
    }

    const deleted = await prisma.telemetryRecord.deleteMany({
      where: { installationId },
    });
    if (deleted.count > 0) {
      console.log(`  [${installationId}] 기존 ${deleted.count}개 삭제`);
    }

    const registryDevice = findRegistryDevice(installationId);
    const records = registryDevice
      ? buildRegistryRecords(installationId, registryDevice)
      : buildLegacyRecords(installationId);

    await prisma.telemetryRecord.createMany({ data: records });
    console.log(`✓ [${installationId}] ${records.length}개 레코드 삽입 완료`);
  }

  console.log("\n시계열 테스트 데이터 삽입 완료!");
}

main()
  .catch((e) => {
    console.error("오류:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
