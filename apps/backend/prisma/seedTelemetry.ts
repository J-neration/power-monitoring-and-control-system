/**
 * 테스트용 TelemetryRecord 시계열 데이터 생성 스크립트
 * 최근 24시간, 30분 간격 (48포인트) 를 대상 장치에 INSERT 합니다.
 *
 * 사용법: tsx prisma/seedTelemetry.ts
 */
import "dotenv/config";
import { PrismaClient } from "./generated/client/client.js";
import type { TelemetryRecordCreateManyInput } from "./generated/client/models/TelemetryRecord.js";
import { PrismaPg } from "@prisma/adapter-pg";

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

// 테스트 데이터를 넣을 installationId 목록
const TARGETS = [
  "PSVG-SONGDO01",
  "PSVG-SONGDO02",
  "PSVG-RNDTEST5",
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

async function main() {
  const now = Date.now();

  for (const installationId of TARGETS) {
    // 기존 테스트 데이터 삭제 후 재삽입
    const deleted = await prisma.telemetryRecord.deleteMany({
      where: { installationId },
    });
    if (deleted.count > 0) {
      console.log(`  [${installationId}] 기존 ${deleted.count}개 삭제`);
    }

    const records: TelemetryRecordCreateManyInput[] = [];
    for (let i = 0; i < TOTAL_POINTS; i++) {
      const recordedAt = new Date(now - (TOTAL_POINTS - i) * INTERVAL_MINUTES * 60 * 1000);

      // 장치별로 살짝 다른 기준값 사용
      const isRnd = installationId.startsWith("PSVG-RND");
      const vBase = isRnd ? 218 : 220.3;
      const iBase = isRnd ? 30 : 47;
      const thdBase = isRnd ? 8 : 3.2;
      // S/P/Q/H: kvar·kVA 스케일 테스트값 (대략 10~100)
      const qBase = isRnd ? 45 : 60;

      // 야간(0~6시)에는 부하 전류가 낮아지는 패턴
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
