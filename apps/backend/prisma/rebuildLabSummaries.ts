/**
 * dev 전용: 시작실(prime-rnd-lab-1)의 시간/일 요약만 원본에서 다시 만든다.
 * 10분 원본과 다른 설치지점은 지우지 않는다.
 */
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/client/client.js";
import {
  ARRAY_METRICS,
  SCALAR_METRICS,
  aggregateSamples,
  type RawSample,
  type SummaryPayload,
} from "../src/lib/telemetryAggregate.js";
import { kstDayStart, kstHourStart } from "../src/lib/kstBuckets.js";

const appDir = path.resolve(import.meta.dirname, "..");
const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [".env", ".env.local", `.env.${nodeEnv}`, `.env.${nodeEnv}.local`]) {
  config({ path: path.resolve(appDir, file), override: true });
}

const INSTALLATION_ID = "prime-rnd-lab-1";
const INTERVAL_MS = 10 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function summaryRow(bucketStart: Date, payload: SummaryPayload) {
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

function toSample(row: Record<string, unknown>): RawSample {
  const values: RawSample["values"] = {};
  for (const key of SCALAR_METRICS) {
    const value = row[key];
    values[key] = typeof value === "number" ? value : null;
  }
  const arrays: RawSample["arrays"] = {};
  for (const key of ARRAY_METRICS) {
    const value = row[key];
    arrays[key] = Array.isArray(value)
      ? value.filter((item): item is number => typeof item === "number")
      : null;
  }
  return {
    id: String(row.id),
    recordedAt: row.recordedAt instanceof Date ? row.recordedAt : new Date(String(row.recordedAt)),
    receivedAt: row.receivedAt instanceof Date ? row.receivedAt : null,
    values,
    arrays,
  };
}

async function main() {
  const select: Record<string, boolean> = {
    id: true,
    recordedAt: true,
    receivedAt: true,
  };
  for (const key of SCALAR_METRICS) select[key] = true;
  for (const key of ARRAY_METRICS) select[key] = true;

  const stored = await prisma.telemetryRecord.findMany({
    where: { installationId: INSTALLATION_ID },
    select: select as { id: true; recordedAt: true },
  });
  const samples = stored.map((row) => toSample(row as unknown as Record<string, unknown>));
  console.log(`raw ${samples.length}`);

  const byHour = new Map<number, RawSample[]>();
  const byDay = new Map<number, RawSample[]>();
  for (const sample of samples) {
    const hour = kstHourStart(sample.recordedAt).getTime();
    const day = kstDayStart(sample.recordedAt).getTime();
    const hours = byHour.get(hour);
    if (hours) hours.push(sample);
    else byHour.set(hour, [sample]);
    const days = byDay.get(day);
    if (days) days.push(sample);
    else byDay.set(day, [sample]);
  }

  const hourly = [...byHour.entries()].flatMap(([ms, group]) => {
    const payload = aggregateSamples(group, 6, INTERVAL_MS);
    return payload ? [summaryRow(new Date(ms), payload)] : [];
  });
  const daily = [...byDay.entries()].flatMap(([ms, group]) => {
    const payload = aggregateSamples(group, 144, INTERVAL_MS);
    return payload ? [summaryRow(new Date(ms), payload)] : [];
  });

  await prisma.telemetryHourlySummary.deleteMany({ where: { installationId: INSTALLATION_ID } });
  await prisma.telemetryDailySummary.deleteMany({ where: { installationId: INSTALLATION_ID } });
  for (let i = 0; i < hourly.length; i += 400) {
    await prisma.telemetryHourlySummary.createMany({ data: hourly.slice(i, i + 400) });
  }
  await prisma.telemetryDailySummary.createMany({ data: daily });
  console.log(JSON.stringify({ hourly: hourly.length, daily: daily.length }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
