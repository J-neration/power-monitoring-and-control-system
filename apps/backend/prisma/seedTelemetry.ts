/**
 * 테스트용 TelemetryRecord 시계열 데이터 생성 스크립트
 * 경기도 설치지점에만 최근 24시간, 15분 간격 (96포인트) INSERT.
 * 그 외 지역 이력은 삭제한다.
 *
 * 사용법: yarn db:seed:telemetry
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

const INTERVAL_MINUTES = 15;
const TOTAL_POINTS = 96; // 24시간

/** 레지스트리에 계측값이 없는 장치(R&D 등)도 이력 차트가 채워지도록 */
const DEFAULT_BASE: DeviceTelemetry = {
  model: "psvg",
  capacity: 200,
  moduleStatus: [2, 2, 2, 2, 2, 2],
  numOfMods: 6,
  vL1: 220.3,
  vL2: 221.1,
  vL3: 219.8,
  gridCurrentL1: 45.1,
  gridCurrentL2: 44.8,
  gridCurrentL3: 45.3,
  loadCurrentL1: 48.2,
  loadCurrentL2: 47.9,
  loadCurrentL3: 48.5,
  loadCurrentTHDL1: 27.8,
  loadCurrentTHDL2: 28.3,
  loadCurrentTHDL3: 27.7,
  gridCurrentTHDL1: 1.8,
  gridCurrentTHDL2: 1.8,
  gridCurrentTHDL3: 1.7,
  tpf1: 76,
  tpf2: 99,
  dpf1: 78,
  dpf2: 99,
  uncompP: 59,
  compP: 58,
  uncompQ: 93,
  compQ: 17,
  uncompS: 70,
  compS: 55,
  uncompH: 47,
  compH: 5,
};

function registryWave(hour: number, phase: number, amp: number): number {
  return 1 + amp * Math.sin((hour / 24) * 2 * Math.PI + phase);
}

/** 야간 저부하 ~ 오후 피크 */
function loadFactor(hour: number): number {
  if (hour >= 0 && hour < 6) return 0.58;
  if (hour >= 6 && hour < 9) return 0.72 + (hour - 6) * 0.08;
  if (hour >= 9 && hour < 12) return 0.96;
  if (hour >= 12 && hour < 15) return 1.08;
  if (hour >= 15 && hour < 18) return 1.0;
  if (hour >= 18 && hour < 22) return 0.86 - (hour - 18) * 0.03;
  return 0.65;
}

function devicePhase(id: string): number {
  return (id.charCodeAt(id.length - 1) % 10) * 0.628;
}

const r = (v: number, decimals = 2) =>
  Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function findRegistryDevice(installationId: string): DeviceTelemetry | null {
  for (const site of siteRegistry) {
    const inst = site.installations.find((i) => i.id === installationId);
    if (inst?.device) return inst.device;
  }
  return null;
}

function mergeBase(d: DeviceTelemetry | null): DeviceTelemetry {
  if (!d) return { ...DEFAULT_BASE };
  return {
    ...DEFAULT_BASE,
    ...d,
    vL1: d.vL1 ?? DEFAULT_BASE.vL1,
    vL2: d.vL2 ?? DEFAULT_BASE.vL2,
    vL3: d.vL3 ?? DEFAULT_BASE.vL3,
    gridCurrentL1: d.gridCurrentL1 ?? DEFAULT_BASE.gridCurrentL1,
    gridCurrentL2: d.gridCurrentL2 ?? DEFAULT_BASE.gridCurrentL2,
    gridCurrentL3: d.gridCurrentL3 ?? DEFAULT_BASE.gridCurrentL3,
    loadCurrentL1: d.loadCurrentL1 ?? DEFAULT_BASE.loadCurrentL1,
    loadCurrentL2: d.loadCurrentL2 ?? DEFAULT_BASE.loadCurrentL2,
    loadCurrentL3: d.loadCurrentL3 ?? DEFAULT_BASE.loadCurrentL3,
    loadCurrentTHDL1: d.loadCurrentTHDL1 ?? DEFAULT_BASE.loadCurrentTHDL1,
    loadCurrentTHDL2: d.loadCurrentTHDL2 ?? DEFAULT_BASE.loadCurrentTHDL2,
    loadCurrentTHDL3: d.loadCurrentTHDL3 ?? DEFAULT_BASE.loadCurrentTHDL3,
    gridCurrentTHDL1: d.gridCurrentTHDL1 ?? DEFAULT_BASE.gridCurrentTHDL1,
    gridCurrentTHDL2: d.gridCurrentTHDL2 ?? DEFAULT_BASE.gridCurrentTHDL2,
    gridCurrentTHDL3: d.gridCurrentTHDL3 ?? DEFAULT_BASE.gridCurrentTHDL3,
    tpf1: d.tpf1 ?? DEFAULT_BASE.tpf1,
    tpf2: d.tpf2 ?? DEFAULT_BASE.tpf2,
    dpf1: d.dpf1 ?? DEFAULT_BASE.dpf1,
    dpf2: d.dpf2 ?? DEFAULT_BASE.dpf2,
    uncompP: d.uncompP ?? DEFAULT_BASE.uncompP,
    compP: d.compP ?? DEFAULT_BASE.compP,
    uncompQ: d.uncompQ ?? DEFAULT_BASE.uncompQ,
    compQ: d.compQ ?? DEFAULT_BASE.compQ,
    uncompS: d.uncompS ?? DEFAULT_BASE.uncompS,
    compS: d.compS ?? DEFAULT_BASE.compS,
    uncompH: d.uncompH ?? DEFAULT_BASE.uncompH,
    compH: d.compH ?? DEFAULT_BASE.compH,
    capacity: d.capacity ?? DEFAULT_BASE.capacity,
    moduleStatus:
      d.moduleStatus?.length ? d.moduleStatus : DEFAULT_BASE.moduleStatus,
    numOfMods: d.numOfMods || DEFAULT_BASE.numOfMods,
  };
}

function capacityAndThermalAtHour(
  installationId: string,
  totalCap: number,
  h: number,
  lf: number,
) {
  const phase = devicePhase(installationId);
  // 오후 피크에 주위 온도가 주의선(35°C)을 넘고, 모듈은 주의선(40°C) 근처까지
  const diurnal = 0.92 + 0.12 * lf;
  const wTemp = registryWave(h, phase + 3.0, 0.05) * diurnal;
  const areaBase = [32.4, 34.8, 33.6, 31.8];
  const modBase = [38, 42, 40, 37, 41, 39];
  const fanBase = [7.2, 8.6];
  const opRatio = clamp(0.55 + 0.38 * lf, 0.4, 0.95);
  const opCap = r(totalCap * opRatio, 1);
  const rpRatio = clamp(0.62 + 0.22 * lf, 0.45, 0.92);
  const rpCap = r(opCap * rpRatio, 1);
  const margin = r(totalCap - opCap, 1);
  return {
    areaTemp: areaBase.map((b) => r(b * wTemp, 1)),
    moduleTemp: modBase.map((b) => r(b * wTemp, 1)),
    fanSpeed: fanBase.map((b) => r(b * (0.85 + 0.25 * lf), 1)),
    totalCapacity: totalCap,
    operatingCapacity: opCap,
    reactivePowerCapacity: rpCap,
    availableMargin: margin,
  };
}

function buildRecords(
  installationId: string,
  registryDevice: DeviceTelemetry | null,
): TelemetryRecordCreateManyInput[] {
  const d = mergeBase(registryDevice);
  const now = Date.now();
  const phase = devicePhase(installationId);
  const records: TelemetryRecordCreateManyInput[] = [];
  const totalCap = d.capacity ?? 200;

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const minutesAgo = (TOTAL_POINTS - 1 - i) * INTERVAL_MINUTES;
    const recordedAt = new Date(now - minutesAgo * 60 * 1000);
    const h = recordedAt.getHours() + recordedAt.getMinutes() / 60;
    const lf = loadFactor(h);

    const wV = registryWave(h, phase, 0.008);
    const wI = registryWave(h, phase + 1.0, 0.05) * lf;
    const wTHD = registryWave(h, phase + 2.0, 0.1) * (0.85 + 0.2 * lf);
    const wPF = registryWave(h, phase + 0.5, 0.02);
    const thermalCap = capacityAndThermalAtHour(installationId, totalCap, h, lf);

    records.push({
      installationId,
      recordedAt,
      moduleStatus: d.moduleStatus ?? [],
      numOfMods: d.numOfMods ?? 0,
      vL1: r((d.vL1 ?? 220) * wV),
      vL2: r((d.vL2 ?? 221) * wV),
      vL3: r((d.vL3 ?? 219) * wV),
      gridCurrentL1: r((d.gridCurrentL1 ?? 45) * wI),
      gridCurrentL2: r((d.gridCurrentL2 ?? 45) * wI),
      gridCurrentL3: r((d.gridCurrentL3 ?? 45) * wI),
      loadCurrentL1: r((d.loadCurrentL1 ?? 48) * wI),
      loadCurrentL2: r((d.loadCurrentL2 ?? 48) * wI),
      loadCurrentL3: r((d.loadCurrentL3 ?? 48) * wI),
      loadCurrentTHDL1: r((d.loadCurrentTHDL1 ?? 28) * wTHD),
      loadCurrentTHDL2: r((d.loadCurrentTHDL2 ?? 28) * wTHD),
      loadCurrentTHDL3: r((d.loadCurrentTHDL3 ?? 28) * wTHD),
      gridCurrentTHDL1: r((d.gridCurrentTHDL1 ?? 1.8) * wTHD),
      gridCurrentTHDL2: r((d.gridCurrentTHDL2 ?? 1.8) * wTHD),
      gridCurrentTHDL3: r((d.gridCurrentTHDL3 ?? 1.7) * wTHD),
      tpf1: clamp(r((d.tpf1 ?? 76) * wPF, 1), 55, 99),
      tpf2: clamp(r((d.tpf2 ?? 99) * wPF, 1), 90, 100),
      dpf1: clamp(r((d.dpf1 ?? 78) * wPF, 1), 55, 99),
      dpf2: clamp(r((d.dpf2 ?? 99) * wPF, 1), 90, 100),
      uncompP: r((d.uncompP ?? 59) * wI, 0),
      compP: r((d.compP ?? 58) * wI, 0),
      uncompQ: r((d.uncompQ ?? 93) * wI, 0),
      compQ: r((d.compQ ?? 17) * wI, 0),
      uncompS: r((d.uncompS ?? 70) * wI, 0),
      compS: r((d.compS ?? 55) * wI, 0),
      uncompH: r((d.uncompH ?? 47) * wI, 0),
      compH: r((d.compH ?? 5) * wI, 0),
      ...thermalCap,
    });
  }

  return records;
}

const GYEONGGI_INSTALLATION_IDS = siteRegistry
  .filter((site) => site.region === "경기도")
  .flatMap((site) => site.installations.map((inst) => inst.id));

async function main() {
  if (GYEONGGI_INSTALLATION_IDS.length === 0) {
    console.warn("⚠ 경기도 설치지점이 레지스트리에 없습니다");
    return;
  }

  const others = await prisma.telemetryRecord.deleteMany({
    where: { installationId: { notIn: GYEONGGI_INSTALLATION_IDS } },
  });
  if (others.count > 0) {
    console.log(`경기도 외 이력 ${others.count}개 삭제\n`);
  }

  console.log(
    `경기도 24시간 이력 시드: ${GYEONGGI_INSTALLATION_IDS.length}개 설치지점, ${TOTAL_POINTS}포인트/${INTERVAL_MINUTES}분\n`,
  );

  for (const installationId of GYEONGGI_INSTALLATION_IDS) {
    const inst = await prisma.installation.findUnique({
      where: { id: installationId },
      select: { id: true },
    });
    if (!inst) {
      console.warn(`⚠ [${installationId}] Installation 없음 — 건너뜀`);
      continue;
    }

    const deleted = await prisma.telemetryRecord.deleteMany({
      where: { installationId },
    });
    if (deleted.count > 0) {
      console.log(`  [${installationId}] 기존 ${deleted.count}개 삭제`);
    }

    const records = buildRecords(
      installationId,
      findRegistryDevice(installationId),
    );
    await prisma.telemetryRecord.createMany({ data: records });
    console.log(`✓ [${installationId}] ${records.length}개 삽입`);
  }

  console.log("\n경기도 시계열 테스트 데이터 삽입 완료!");
}

main()
  .catch((e) => {
    console.error("오류:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
