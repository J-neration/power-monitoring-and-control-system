/**
 * 전시회용 2주간 TelemetryRecord + FaultEvent 시드 스크립트
 * 2026 국제 전기전력 전시회 (5/6~5/8) 대비, 4/27~5/10 데이터 생성
 *
 * 사용법: npm run db:seed:exhibition
 *         또는 tsx prisma/seedExhibition.ts
 */
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "./generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { siteRegistry } from "../src/data/deviceRegistry.js";

const appDir = path.resolve(import.meta.dirname, "..");
const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [".env", ".env.local", `.env.${nodeEnv}`, `.env.${nodeEnv}.local`]) {
  config({ path: path.resolve(appDir, file), override: true });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ── 설정 ──────────────────────────────────────────────────────────────────────
const KST_OFFSET = 9 * 60 * 60 * 1000;
const PERIOD_START = new Date("2026-04-26T15:00:00Z"); // 4/27 00:00 KST
const PERIOD_END = new Date("2026-05-10T15:00:00Z");   // 5/10 24:00 KST
const INTERVAL_MS = 30 * 60 * 1000; // 30분
const TOTAL_POINTS = Math.floor((PERIOD_END.getTime() - PERIOD_START.getTime()) / INTERVAL_MS);

const r = (v: number, d = 1) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

// ── 파형 생성 ──────────────────────────────────────────────────────────────────
function devicePhase(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return (hash % 100) * 0.0628;
}

function wave(base: number, amp: number, phase: number, noise: number, t: number): number {
  const sin = Math.sin((t / 48) * 2 * Math.PI + phase);
  const rand = (pseudoRandom(t, phase) - 0.5) * 2 * noise;
  return base + sin * amp + rand;
}

// 결정적 난수 (시드 재현 가능)
function pseudoRandom(t: number, seed: number): number {
  const x = Math.sin((t + 1) * 9301 + seed * 49297) * 49297;
  return x - Math.floor(x);
}

// 시간대별 부하 계수 (KST 기준)
function loadFactor(hour: number, dayOfWeek: number, isDataCenter: boolean): number {
  let factor = 1.0;

  if (hour >= 0 && hour < 6) factor = 0.55;
  else if (hour >= 6 && hour < 9) factor = 0.7 + (hour - 6) * 0.1;
  else if (hour >= 9 && hour < 13) factor = 1.0;
  else if (hour >= 13 && hour < 15) factor = 1.08;
  else if (hour >= 15 && hour < 18) factor = 0.98;
  else if (hour >= 18 && hour < 22) factor = 0.85 - (hour - 18) * 0.025;
  else factor = 0.65;

  // 주말 감소 (데이터센터는 24/7)
  if (!isDataCenter && (dayOfWeek === 0 || dayOfWeek === 6)) {
    factor *= 0.72;
  }

  return factor;
}

// ── 온도·팬·용량 필드 ──────────────────────────────────────────────────────────
function capacityAndThermal(id: string, totalCap: number, t: number, lf: number) {
  const phase = devicePhase(id);
  const wTemp = 1 + 0.04 * Math.sin((t / 48) * 2 * Math.PI + phase + 3.0);
  const tempFactor = wTemp * (0.85 + 0.15 * lf);

  const areaBase = [34, 36, 35, 33];
  const modBase = [40, 44, 42, 39, 43, 41];
  const fanBase = [7.5, 8.8];

  const opRatio = 0.6 + 0.3 * lf;
  const opCap = r(totalCap * opRatio);
  const rpCap = r(opCap * (0.65 + 0.2 * lf));
  const margin = r(totalCap - opCap);

  return {
    areaTemp: areaBase.map((b) => r(b * tempFactor)),
    moduleTemp: modBase.map((b) => r(b * tempFactor)),
    fanSpeed: fanBase.map((b) => r(b * (0.7 + 0.3 * lf) * wTemp)),
    totalCapacity: totalCap,
    operatingCapacity: opCap,
    reactivePowerCapacity: rpCap,
    availableMargin: margin,
  };
}

// ── 모듈 상태 패턴 ───────────────────────────────────────────────────────────
const MODULE_PATTERNS: number[][] = [
  [2, 2, 2, 2, 2, 2],
  [2, 2, 2, 2, 2, 0],
  [2, 2, 2, 2, 0, 2],
  [2, 2, 0, 2, 2, 2],
];

function moduleStatusForPoint(id: string, t: number, baseStatus: number[]): number[] {
  if (baseStatus.length === 0) return [];
  const idx = Math.floor(pseudoRandom(t, devicePhase(id)) * MODULE_PATTERNS.length);
  return MODULE_PATTERNS[idx];
}

// ── Fault 이벤트 정의 ─────────────────────────────────────────────────────────
interface FaultDef {
  installationId: string;
  module: number;
  desc: string;
  occurredAt: string; // KST 시각
  clearedAt: string | null;
}

const FAULT_EVENTS: FaultDef[] = [
  { installationId: "PSVG-CHEONGNA01", module: 5, desc: "Over Temperature", occurredAt: "2026-04-28T14:30:00", clearedAt: "2026-04-28T15:45:00" },
  { installationId: "PSVG-BUSAN02", module: 3, desc: "Communication Timeout", occurredAt: "2026-04-29T09:15:00", clearedAt: "2026-04-29T09:30:00" },
  { installationId: "PSVG-DONGTAN02", module: 4, desc: "Fan Failure", occurredAt: "2026-04-30T22:10:00", clearedAt: "2026-05-01T08:20:00" },
  { installationId: "PSVG-LDAEGU01", module: 5, desc: "DC Link Over Voltage", occurredAt: "2026-05-01T16:45:00", clearedAt: "2026-05-01T17:00:00" },
  { installationId: "PSVG-DC-MAPO02", module: 2, desc: "Over Temperature", occurredAt: "2026-05-02T03:20:00", clearedAt: "2026-05-02T04:15:00" },
  { installationId: "PSVG-CHEONGNA01", module: 5, desc: "IGBT Short Circuit", occurredAt: "2026-05-03T11:30:00", clearedAt: "2026-05-03T14:00:00" },
  { installationId: "PSVG-DC-DAEGU03", module: 5, desc: "Output Over Current", occurredAt: "2026-05-04T08:00:00", clearedAt: "2026-05-04T09:30:00" },
  { installationId: "PSVG-BUSAN02", module: 2, desc: "Capacitor Degradation", occurredAt: "2026-05-05T19:45:00", clearedAt: "2026-05-05T21:00:00" },
  { installationId: "PSVG-DONGTAN02", module: 1, desc: "Over Temperature", occurredAt: "2026-05-06T10:15:00", clearedAt: "2026-05-06T11:00:00" },
  { installationId: "PSVG-LDAEGU01", module: 5, desc: "Over Temperature", occurredAt: "2026-05-06T23:30:00", clearedAt: null },
  { installationId: "PSVG-DC-MAPO02", module: 4, desc: "Input Fuse Blown", occurredAt: "2026-05-07T06:30:00", clearedAt: "2026-05-07T10:00:00" },
  { installationId: "PSVG-DC-DAEGU03", module: 5, desc: "Communication Timeout", occurredAt: "2026-05-07T14:20:00", clearedAt: "2026-05-07T14:45:00" },
  { installationId: "PSVG-CHEONGNA01", module: 3, desc: "Over Temperature", occurredAt: "2026-05-08T07:50:00", clearedAt: "2026-05-08T08:30:00" },
  { installationId: "PSVG-BUSAN02", module: 5, desc: "DC Link Over Voltage", occurredAt: "2026-05-08T16:10:00", clearedAt: null },
  { installationId: "PSVG-DC-DAEGU03", module: 2, desc: "Fan Failure", occurredAt: "2026-05-09T02:15:00", clearedAt: "2026-05-09T06:00:00" },
];

function kstToUtc(kst: string): Date {
  return new Date(new Date(kst + "+09:00").getTime());
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`전시회용 시드 시작: ${TOTAL_POINTS} 포인트/장치, 기간 4/27~5/10 (KST)`);

  // 기간 내 기존 데이터 삭제
  const deleted = await prisma.telemetryRecord.deleteMany({
    where: {
      recordedAt: { gte: PERIOD_START, lt: PERIOD_END },
    },
  });
  console.log(`기존 레코드 ${deleted.count}개 삭제`);

  // 기존 FaultEvent 삭제 (해당 기간)
  const deletedFaults = await prisma.faultEvent.deleteMany({
    where: {
      occurredAt: { gte: PERIOD_START, lt: PERIOD_END },
    },
  });
  console.log(`기존 FaultEvent ${deletedFaults.count}개 삭제`);

  let totalRecords = 0;

  for (const site of siteRegistry) {
    const isDataCenter = site.client === "datacenter";

    for (const inst of site.installations) {
      const d = inst.device;
      if (!d) continue;

      const phase = devicePhase(inst.id);
      const totalCap = d.capacity ?? 200;
      const baseI = d.loadCurrentL1 ?? 40;
      const baseV = d.vL1 ?? 220;
      const baseThdLoad = d.loadCurrentTHDL1 ?? 25;
      const baseThdGrid = d.gridCurrentTHDL1 ?? 2.0;

      const records: any[] = [];

      for (let t = 0; t < TOTAL_POINTS; t++) {
        const recordedAt = new Date(PERIOD_START.getTime() + t * INTERVAL_MS);
        const kstTime = new Date(recordedAt.getTime() + KST_OFFSET);
        const hour = kstTime.getHours();
        const dayOfWeek = kstTime.getDay();

        const lf = loadFactor(hour, dayOfWeek, isDataCenter);

        // 전압: 안정적 (±1.5V)
        const vL1 = r(wave(baseV, 1.5, phase, 0.3, t));
        const vL2 = r(wave((d.vL2 ?? baseV + 0.8), 1.2, phase + 0.5, 0.3, t));
        const vL3 = r(wave((d.vL3 ?? baseV - 0.5), 1.3, phase + 1.0, 0.3, t));

        // 부하전류: 시간대별 변동
        const iScale = lf;
        const loadCurrentL1 = r(wave(baseI * iScale, 5, phase, 1.2, t));
        const loadCurrentL2 = r(wave((d.loadCurrentL2 ?? baseI - 0.5) * iScale, 4.5, phase + 0.5, 1.1, t));
        const loadCurrentL3 = r(wave((d.loadCurrentL3 ?? baseI + 0.5) * iScale, 5.5, phase + 1.0, 1.3, t));

        // 계통전류
        const gridCurrentL1 = r(wave((d.gridCurrentL1 ?? baseI + 2) * iScale, 5, phase + 0.1, 0.9, t));
        const gridCurrentL2 = r(wave((d.gridCurrentL2 ?? baseI + 1.5) * iScale, 4.5, phase + 0.6, 0.9, t));
        const gridCurrentL3 = r(wave((d.gridCurrentL3 ?? baseI + 2.5) * iScale, 5.5, phase + 1.1, 0.9, t));

        // 부하측 THD (보상 전): 부하 높을수록 THD 증가
        const thdLoadFactor = 0.9 + 0.2 * lf;
        const loadCurrentTHDL1 = r(wave(baseThdLoad * thdLoadFactor, 2.0, phase + 2.0, 0.5, t));
        const loadCurrentTHDL2 = r(wave((d.loadCurrentTHDL2 ?? baseThdLoad + 0.5) * thdLoadFactor, 1.8, phase + 2.5, 0.5, t));
        const loadCurrentTHDL3 = r(wave((d.loadCurrentTHDL3 ?? baseThdLoad - 0.3) * thdLoadFactor, 2.2, phase + 3.0, 0.5, t));

        // 계통측 THD (보상 후): 안정적으로 낮음
        const gridCurrentTHDL1 = r(wave(baseThdGrid, 0.3, phase + 2.1, 0.15, t));
        const gridCurrentTHDL2 = r(wave((d.gridCurrentTHDL2 ?? baseThdGrid + 0.2), 0.3, phase + 2.6, 0.15, t));
        const gridCurrentTHDL3 = r(wave((d.gridCurrentTHDL3 ?? baseThdGrid - 0.1), 0.3, phase + 3.1, 0.15, t));

        // 역률 (보상 전: 70-80%, 보상 후: 96-99%)
        const pfBefore = (d.tpf1 ?? 75) / 100;
        const pfAfter = (d.tpf2 ?? 98) / 100;
        const tpf1 = r(Math.max(0.60, Math.min(0.95, wave(pfBefore, 0.02, phase + 0.3, 0.008, t))), 4);
        const tpf2 = r(Math.max(0.90, Math.min(1.0, wave(pfAfter, 0.008, phase + 0.4, 0.003, t))), 4);
        const dpf1 = r(Math.max(0.62, Math.min(0.95, wave((d.dpf1 ?? 76) / 100, 0.02, phase + 0.35, 0.008, t))), 4);
        const dpf2 = r(Math.max(0.92, Math.min(1.0, wave((d.dpf2 ?? 99) / 100, 0.006, phase + 0.45, 0.003, t))), 4);

        // 전력 (보상 전후 차이 극대화)
        const powerScale = lf;
        const uncompQ = r(wave((d.uncompQ ?? 80) * powerScale, 8, phase, 2, t), 0);
        const compQ = r(wave(Math.max(8, (d.uncompQ ?? 80) * 0.18) * powerScale, 2, phase + 0.3, 1, t), 0);
        const uncompS = r(wave((d.uncompS ?? 70) * powerScale, 10, phase, 2.5, t), 0);
        const compS = r(wave((d.uncompS ?? 70) * 0.78 * powerScale, 7, phase + 0.2, 2, t), 0);
        const uncompP = r(wave((d.uncompP ?? 55) * powerScale, 8, phase, 2, t), 0);
        const compP = r(wave((d.compP ?? 54) * powerScale, 7, phase + 0.1, 1.5, t), 0);
        const uncompH = r(wave((d.uncompH ?? 45) * powerScale, 6, phase + 0.5, 1.5, t), 0);
        const compH = r(wave(Math.max(3, (d.uncompH ?? 45) * 0.10) * powerScale, 1.5, phase + 0.6, 0.5, t), 0);

        const thermal = capacityAndThermal(inst.id, totalCap, t, lf);
        const modStatus = moduleStatusForPoint(inst.id, t, d.moduleStatus);

        records.push({
          installationId: inst.id,
          recordedAt,
          moduleStatus: modStatus,
          numOfMods: d.numOfMods ?? 0,
          vL1, vL2, vL3,
          loadCurrentL1, loadCurrentL2, loadCurrentL3,
          gridCurrentL1, gridCurrentL2, gridCurrentL3,
          loadCurrentTHDL1, loadCurrentTHDL2, loadCurrentTHDL3,
          gridCurrentTHDL1, gridCurrentTHDL2, gridCurrentTHDL3,
          tpf1, tpf2, dpf1, dpf2,
          uncompQ, compQ, uncompS, compS, uncompP, compP, uncompH, compH,
          ...thermal,
        });
      }

      // 배치 삽입 (500건씩)
      for (let batch = 0; batch < records.length; batch += 500) {
        await prisma.telemetryRecord.createMany({
          data: records.slice(batch, batch + 500),
        });
      }

      totalRecords += records.length;
      console.log(`  ✓ ${inst.id}: ${records.length}개 레코드`);
    }
  }

  console.log(`\n총 ${totalRecords}개 TelemetryRecord 삽입 완료`);

  // ── Fault 이벤트 삽입 ─────────────────────────────────────────────────────
  console.log("\nFault 이벤트 삽입...");

  for (const fault of FAULT_EVENTS) {
    const occurredAt = kstToUtc(fault.occurredAt);

    await prisma.faultEvent.create({
      data: {
        installationId: fault.installationId,
        module: fault.module,
        desc: fault.desc,
        occurredAt,
      },
    });

    // ModuleFaultState upsert
    if (fault.clearedAt === null) {
      // 미해결 fault → RAISE
      await prisma.moduleFaultState.upsert({
        where: {
          installationId_faultCode: {
            installationId: fault.installationId,
            faultCode: fault.module + 1,
          },
        },
        update: {
          lastEvent: "RAISE",
          resolvedAt: null,
          eventName: fault.desc,
          criticalChannel: false,
          repeatCount: { increment: 1 },
        },
        create: {
          installationId: fault.installationId,
          faultCode: fault.module + 1,
          lastEvent: "RAISE",
          resolvedAt: null,
          eventName: fault.desc,
          criticalChannel: false,
          repeatCount: 1,
        },
      });
    } else {
      // 해결된 fault → CLEAR
      const resolvedAt = kstToUtc(fault.clearedAt);
      await prisma.moduleFaultState.upsert({
        where: {
          installationId_faultCode: {
            installationId: fault.installationId,
            faultCode: fault.module + 1,
          },
        },
        update: {
          lastEvent: "CLEAR",
          resolvedAt,
          eventName: fault.desc,
          criticalChannel: false,
          repeatCount: { increment: 1 },
        },
        create: {
          installationId: fault.installationId,
          faultCode: fault.module + 1,
          lastEvent: "CLEAR",
          resolvedAt,
          eventName: fault.desc,
          criticalChannel: false,
          repeatCount: 1,
        },
      });
    }

    const status = fault.clearedAt ? "CLEAR" : "ACTIVE";
    console.log(`  ✓ ${fault.installationId} M${fault.module}: ${fault.desc} [${status}]`);
  }

  console.log(`\n${FAULT_EVENTS.length}개 FaultEvent 삽입 완료`);
  console.log("\n전시회용 시드 완료!");
}

main()
  .catch((e) => {
    console.error("오류:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
