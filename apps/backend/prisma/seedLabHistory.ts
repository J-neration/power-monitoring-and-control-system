/**
 * dev 전용: 프라임 연구소 시작실(prime-rnd-lab-1)에만
 * 최근 1년 10분 이력을 넣고 시간/일 요약을 채운다.
 * 다른 설치지점의 원본은 삭제하지 않는다.
 */
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/client/client.js";
import {
  aggregateSamples,
  type RawSample,
  type SummaryPayload,
} from "../src/lib/telemetryAggregate.js";
import { addDays, kstDayStart, kstHourStart } from "../src/lib/kstBuckets.js";

const appDir = path.resolve(import.meta.dirname, "..");
const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [".env", ".env.local", `.env.${nodeEnv}`, `.env.${nodeEnv}.local`]) {
  config({ path: path.resolve(appDir, file), override: true });
}

const INSTALLATION_ID = "prime-rnd-lab-1";
const INTERVAL_MS = 10 * 60 * 1000;
const KST = 9 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const r = (v: number, decimals = 2) =>
  Math.round(v * 10 ** decimals) / 10 ** decimals;

function loadFactor(hour: number): number {
  if (hour < 6) return 0.55;
  if (hour < 9) return 0.7 + (hour - 6) * 0.08;
  if (hour < 12) return 0.95;
  if (hour < 15) return 1.08;
  if (hour < 18) return 1.0;
  if (hour < 22) return 0.84;
  return 0.62;
}

function sampleAt(at: Date): RawSample {
  const kst = new Date(at.getTime() + KST);
  const hour = kst.getUTCHours() + kst.getUTCMinutes() / 60;
  const month = kst.getUTCMonth();
  const season = 0.9 + 0.18 * Math.sin(((month - 3) / 12) * Math.PI * 2);
  const lf = loadFactor(hour) * season;
  const wave = 1 + 0.03 * Math.sin((hour / 24) * Math.PI * 2);
  return {
    id: `${INSTALLATION_ID}:${at.toISOString()}`,
    recordedAt: at,
    receivedAt: at,
    values: {
      vL1: r(220.4 * wave),
      vL2: r(219.6 * wave),
      vL3: r(221.1 * wave),
      gridCurrentL1: r(42 * lf),
      gridCurrentL2: r(41.2 * lf),
      gridCurrentL3: r(43.1 * lf),
      loadCurrentL1: r(46 * lf),
      loadCurrentL2: r(45.4 * lf),
      loadCurrentL3: r(46.8 * lf),
      loadCurrentTHDL1: r(26 * (0.9 + 0.15 * lf)),
      loadCurrentTHDL2: r(27 * (0.9 + 0.15 * lf)),
      loadCurrentTHDL3: r(25.5 * (0.9 + 0.15 * lf)),
      gridCurrentTHDL1: r(1.7 * (0.85 + 0.2 * lf)),
      gridCurrentTHDL2: r(1.8 * (0.85 + 0.2 * lf)),
      gridCurrentTHDL3: r(1.6 * (0.85 + 0.2 * lf)),
      tpf1: r(74 + 6 * (1 - lf), 1),
      tpf2: r(97 + 2 * lf, 1),
      dpf1: r(76 + 5 * (1 - lf), 1),
      dpf2: r(98 + lf, 1),
      uncompP: r(58 * lf, 1),
      compP: r(56 * lf, 1),
      uncompQ: r(90 * lf, 1),
      compQ: r(16 * lf, 1),
      uncompS: r(108 * lf, 1),
      compS: r(60 * lf, 1),
      uncompH: r(40 * lf, 1),
      compH: r(6 * lf, 1),
      totalCapacity: 200,
      operatingCapacity: r(200 * (0.5 + 0.4 * lf), 1),
      reactivePowerCapacity: r(200 * (0.5 + 0.4 * lf) * 0.7, 1),
      availableMargin: r(200 * (1 - (0.5 + 0.4 * lf)), 1),
    },
    arrays: {
      areaTemp: [0, 1, 2, 3].map((i) => r(28 + i * 0.6 + 8 * lf, 1)),
      moduleTemp: [0, 1, 2, 3, 4, 5].map((i) => r(34 + i * 0.8 + 10 * lf, 1)),
      fanSpeed: [r(6.5 + 3 * lf, 1), r(7.2 + 3.2 * lf, 1)],
    },
  };
}

function summaryData(bucketStart: Date, payload: SummaryPayload) {
  return {
    installationId: INSTALLATION_ID,
    bucketStart,
    sampleCount: payload.sampleCount,
    expectedCount: payload.expectedCount,
    coverage: payload.coverage,
    metrics: payload.metrics as Prisma.InputJsonValue,
    arrayMetrics: payload.arrayMetrics as Prisma.InputJsonValue,
    uncompEnergyKwh: payload.uncompEnergyKwh,
    compEnergyKwh: payload.compEnergyKwh,
    energyEstimated: true,
  };
}

async function main() {
  const inst = await prisma.installation.findUnique({
    where: { id: INSTALLATION_ID },
    select: { id: true, label: true, site: { select: { name: true } } },
  });
  if (!inst) throw new Error(`${INSTALLATION_ID} 설치지점이 없습니다.`);

  const now = new Date();
  const end = new Date(Math.floor(now.getTime() / INTERVAL_MS) * INTERVAL_MS);
  const start = addDays(kstDayStart(end), -364);
  const gapStart = addDays(end, -3);
  gapStart.setUTCMinutes(0, 0, 0);
  const gapFrom = new Date(gapStart.getTime() + 5 * 60 * 60 * 1000);
  const gapTo = new Date(gapFrom.getTime() + 4 * 60 * 60 * 1000);

  const samples: RawSample[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += INTERVAL_MS) {
    const at = new Date(t);
    if (at >= gapFrom && at < gapTo) continue;
    samples.push(sampleAt(at));
  }

  await prisma.telemetryHourlySummary.deleteMany({ where: { installationId: INSTALLATION_ID } });
  await prisma.telemetryDailySummary.deleteMany({ where: { installationId: INSTALLATION_ID } });
  const removed = await prisma.telemetryRecord.deleteMany({ where: { installationId: INSTALLATION_ID } });

  const rows = samples.map((sample) => ({
    installationId: INSTALLATION_ID,
    recordedAt: sample.recordedAt,
    receivedAt: sample.recordedAt,
    moduleStatus: [2, 2, 2, 2, 2, 2],
    numOfMods: 6,
    ...sample.values,
    areaTemp: sample.arrays.areaTemp ?? [],
    moduleTemp: sample.arrays.moduleTemp ?? [],
    fanSpeed: sample.arrays.fanSpeed ?? [],
  }));
  for (let i = 0; i < rows.length; i += 800) {
    await prisma.telemetryRecord.createMany({ data: rows.slice(i, i + 800) });
    if (i % 8000 === 0) console.log(`raw ${i}/${rows.length}`);
  }

  const byHour = new Map<number, RawSample[]>();
  for (const sample of samples) {
    const key = kstHourStart(sample.recordedAt).getTime();
    const list = byHour.get(key);
    if (list) list.push(sample);
    else byHour.set(key, [sample]);
  }
  const hourly = [...byHour.entries()].flatMap(([ms, group]) => {
    const payload = aggregateSamples(group, 6, INTERVAL_MS);
    return payload ? [summaryData(new Date(ms), payload)] : [];
  });
  for (let i = 0; i < hourly.length; i += 400) {
    await prisma.telemetryHourlySummary.createMany({ data: hourly.slice(i, i + 400) });
  }

  const byDay = new Map<number, RawSample[]>();
  for (const sample of samples) {
    const key = kstDayStart(sample.recordedAt).getTime();
    const list = byDay.get(key);
    if (list) list.push(sample);
    else byDay.set(key, [sample]);
  }
  const daily = [...byDay.entries()].flatMap(([ms, group]) => {
    const payload = aggregateSamples(group, 144, INTERVAL_MS);
    return payload ? [summaryData(new Date(ms), payload)] : [];
  });
  await prisma.telemetryDailySummary.createMany({ data: daily });

  const latest = samples[samples.length - 1];
  await prisma.device.upsert({
    where: { installationId: INSTALLATION_ID },
    update: {
      lastSeenAt: latest.recordedAt,
      model: "psvg",
      capacity: 200,
      numOfMods: 6,
      moduleStatus: [2, 2, 2, 2, 2, 2],
      ...latest.values,
      areaTemp: latest.arrays.areaTemp ?? [],
      moduleTemp: latest.arrays.moduleTemp ?? [],
      fanSpeed: latest.arrays.fanSpeed ?? [],
    },
    create: {
      installationId: INSTALLATION_ID,
      lastSeenAt: latest.recordedAt,
      model: "psvg",
      capacity: 200,
      numOfMods: 6,
      moduleStatus: [2, 2, 2, 2, 2, 2],
      ...latest.values,
      areaTemp: latest.arrays.areaTemp ?? [],
      moduleTemp: latest.arrays.moduleTemp ?? [],
      fanSpeed: latest.arrays.fanSpeed ?? [],
    },
  });

  console.log(
    JSON.stringify({
      site: inst.site.name,
      label: inst.label,
      id: INSTALLATION_ID,
      removed: removed.count,
      raw: rows.length,
      hourly: hourly.length,
      daily: daily.length,
      from: start.toISOString(),
      to: end.toISOString(),
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
