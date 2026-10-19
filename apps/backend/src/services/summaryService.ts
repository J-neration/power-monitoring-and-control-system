import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../prisma/generated/client/client.js";
import { addDays, addHours, kstDateKey, kstDayStart, kstHourStart } from "../lib/kstBuckets.js";
import { type ResolvedHistory } from "../lib/historyRange.js";
import { retentionConfig } from "../lib/retentionConfig.js";
import {
  ARRAY_METRICS,
  SCALAR_METRICS,
  aggregateSamples,
  buildHistoryFromSamples,
  buildHistoryFromSummaries,
  dedupeSamples,
  hourEligibleForPurge,
  mergeSummaries,
  type HistoryPoint,
  type MetricStat,
  type RawSample,
  type SummaryPayload,
} from "../lib/telemetryAggregate.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

const SUMMARY_MISSING = "SUMMARY_SCHEMA_MISSING";

let receivedAtColumn: boolean | null = null;

async function hasReceivedAt(): Promise<boolean> {
  if (receivedAtColumn === true) return true;
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'TelemetryRecord'
        AND column_name = 'receivedAt'
    ) AS "exists"
  `;
  receivedAtColumn = Boolean(rows[0]?.exists);
  return receivedAtColumn;
}

export async function summarySchemaReady(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'TelemetryHourlySummary'
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

function isMissingSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist") ||
    message.includes("P2021") ||
    message.includes("42P01") ||
    message.includes(SUMMARY_MISSING)
  );
}

function asStat(value: unknown): MetricStat | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Partial<MetricStat>;
  if (typeof row.n !== "number" || row.n <= 0) return undefined;
  return {
    avg: typeof row.avg === "number" ? row.avg : null,
    min: typeof row.min === "number" ? row.min : null,
    max: typeof row.max === "number" ? row.max : null,
    n: row.n,
    sum: typeof row.sum === "number" ? row.sum : 0,
    weight: typeof row.weight === "number" ? row.weight : 0,
  };
}

function asPayload(value: {
  sampleCount: number;
  expectedCount: number;
  coverage: number;
  metrics: Prisma.JsonValue;
  arrayMetrics: Prisma.JsonValue;
  uncompEnergyKwh: number | null;
  compEnergyKwh: number | null;
  energyEstimated: boolean;
}): SummaryPayload {
  const metrics: SummaryPayload["metrics"] = {};
  if (value.metrics && typeof value.metrics === "object" && !Array.isArray(value.metrics)) {
    for (const key of SCALAR_METRICS) {
      const stat = asStat((value.metrics as Record<string, unknown>)[key]);
      if (stat) metrics[key] = stat;
    }
  }
  const arrayMetrics: SummaryPayload["arrayMetrics"] = {};
  if (value.arrayMetrics && typeof value.arrayMetrics === "object" && !Array.isArray(value.arrayMetrics)) {
    for (const key of ARRAY_METRICS) {
      const raw = (value.arrayMetrics as Record<string, unknown>)[key];
      if (!Array.isArray(raw)) continue;
      arrayMetrics[key] = raw.map((item) => asStat(item) ?? {
        avg: null, min: null, max: null, n: 0, sum: 0, weight: 0,
      });
    }
  }
  return {
    sampleCount: value.sampleCount,
    expectedCount: value.expectedCount,
    coverage: value.coverage,
    metrics,
    arrayMetrics,
    uncompEnergyKwh: value.uncompEnergyKwh,
    compEnergyKwh: value.compEnergyKwh,
    energyEstimated: value.energyEstimated,
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

async function loadSamples(
  installationId: string,
  from: Date,
  to: Date,
): Promise<RawSample[]> {
  const select: Record<string, boolean> = {
    id: true,
    recordedAt: true,
  };
  if (await hasReceivedAt()) select.receivedAt = true;
  for (const key of SCALAR_METRICS) select[key] = true;
  for (const key of ARRAY_METRICS) select[key] = true;
  const rows = await prisma.telemetryRecord.findMany({
    where: { installationId, recordedAt: { gte: from, lt: to } },
    select: select as { id: true; recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });
  return rows.map((row) => toSample(row as unknown as Record<string, unknown>));
}

function summaryData(payload: SummaryPayload) {
  return {
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

async function writeHour(
  installationId: string,
  bucketStart: Date,
  payload: SummaryPayload | null,
  retainBefore: Date,
) {
  if (!payload) {
    if (bucketStart < retainBefore) return;
    await prisma.telemetryHourlySummary.deleteMany({
      where: { installationId, bucketStart },
    });
    return;
  }
  const data = summaryData(payload);
  await prisma.telemetryHourlySummary.upsert({
    where: { installationId_bucketStart: { installationId, bucketStart } },
    create: { installationId, bucketStart, ...data },
    update: data,
  });
}

async function writeDay(
  installationId: string,
  bucketStart: Date,
  payload: SummaryPayload | null,
  retainBefore: Date,
) {
  if (!payload) {
    if (bucketStart < retainBefore) return;
    await prisma.telemetryDailySummary.deleteMany({
      where: { installationId, bucketStart },
    });
    return;
  }
  const data = summaryData(payload);
  await prisma.telemetryDailySummary.upsert({
    where: { installationId_bucketStart: { installationId, bucketStart } },
    create: { installationId, bucketStart, ...data },
    update: data,
  });
}

async function rebuildInstallation(
  installationId: string,
  from: Date,
  to: Date,
  intervalMs: number,
  retainBefore: Date,
) {
  const samples = dedupeSamples(await loadSamples(installationId, from, to));
  const perHour = Math.max(1, Math.round(3_600_000 / intervalMs));
  const hours: Date[] = [];
  for (let cursor = kstHourStart(from); cursor.getTime() < to.getTime(); cursor = addHours(cursor, 1)) {
    hours.push(cursor);
  }
  const grouped = new Map<number, RawSample[]>();
  for (const sample of samples) {
    const key = kstHourStart(sample.recordedAt).getTime();
    const list = grouped.get(key);
    if (list) list.push(sample);
    else grouped.set(key, [sample]);
  }

  const presentHours: Date[] = [];
  for (const hour of hours) {
    const payload = aggregateSamples(grouped.get(hour.getTime()) ?? [], perHour, intervalMs);
    if (!payload) continue;
    presentHours.push(hour);
    await writeHour(installationId, hour, payload, retainBefore);
  }
  if (hours.length > 0) {
    const range = {
      gte: hours[0],
      lt: addHours(hours[hours.length - 1], 1),
    };
    await prisma.telemetryHourlySummary.deleteMany({
      where: {
        installationId,
        bucketStart:
          presentHours.length > 0 ? { ...range, notIn: presentHours } : range,
      },
    });
  }

  const days = new Set<number>();
  for (const hour of hours) days.add(kstDayStart(hour).getTime());
  const presentDays: Date[] = [];
  for (const dayMs of days) {
    const dayStart = new Date(dayMs);
    const daySamples = samples.filter((sample) => {
      const t = sample.recordedAt.getTime();
      return t >= dayStart.getTime() && t < dayStart.getTime() + 86_400_000;
    });
    let payload = aggregateSamples(daySamples, perHour * 24, intervalMs);
    if (!payload) {
      const stored = await prisma.telemetryHourlySummary.findMany({
        where: {
          installationId,
          bucketStart: { gte: dayStart, lt: addDays(dayStart, 1) },
        },
      });
      payload = mergeSummaries(stored.map(asPayload), perHour * 24);
    }
    if (!payload) continue;
    presentDays.push(dayStart);
    await writeDay(installationId, dayStart, payload, retainBefore);
  }
  const dayList = [...days].sort((a, b) => a - b).map((ms) => new Date(ms));
  if (dayList.length > 0) {
    const range = { gte: dayList[0], lte: dayList[dayList.length - 1] };
    await prisma.telemetryDailySummary.deleteMany({
      where: {
        installationId,
        bucketStart: presentDays.length > 0 ? { ...range, notIn: presentDays } : range,
      },
    });
  }
}

async function installationsBetween(from: Date, to: Date): Promise<string[]> {
  const rows = await prisma.telemetryRecord.groupBy({
    by: ["installationId"],
    where: { recordedAt: { gte: from, lt: to } },
  });
  return rows.map((row) => row.installationId);
}

async function readState(key: string): Promise<string | null> {
  const row = await prisma.aggregationState.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeState(key: string, value: string) {
  await prisma.aggregationState.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function logAggregation(
  kind: string,
  status: string,
  message: string,
  detail?: Prisma.InputJsonValue,
) {
  try {
    await prisma.aggregationLog.create({
      data: { kind, status, message, detail },
    });
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
  }
}

async function acquireLease(ttlMs: number): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const token = new Date(Date.now() + ttlMs).toISOString();
  const rows = await prisma.$queryRaw<Array<{ key: string }>>`
    INSERT INTO "AggregationState" ("key", "value", "updatedAt")
    VALUES ('lease', ${token}, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE
    SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP
    WHERE "AggregationState"."value" < ${nowIso}
    RETURNING "key"
  `;
  return rows.length > 0 ? token : null;
}

async function releaseLease(token: string) {
  await prisma.$executeRaw`
    UPDATE "AggregationState"
    SET "value" = ${new Date(0).toISOString()}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "key" = 'lease' AND "value" = ${token}
  `;
}

export type RetentionReport = {
  rawPurgeEnabled: boolean;
  summaryPurgeEnabled: boolean;
  rawDays: number;
  hourlyDays: number;
  dailyDays: number;
  cutoff: string;
  scannedRows: number;
  eligibleRows: number;
  blockedRows: number;
  blockedReasons: Record<string, number>;
  eligibleFrom: string | null;
  eligibleTo: string | null;
  truncated: boolean;
  hourlyPastRetention: number;
  dailyPastRetention: number;
  deletedRows: number;
};

type HourBucket = {
  installationId: string;
  bucketStart: Date;
  rows: Array<{ recordedAt: Date; receivedAt: Date | null }>;
};

async function scanRawPurge(now: Date): Promise<{
  report: Omit<RetentionReport, "deletedRows">;
  eligible: HourBucket[];
}> {
  const cfg = retentionConfig();
  const cutoff = new Date(now.getTime() - cfg.rawDays * 86_400_000);
  const select: Record<string, boolean> = {
    installationId: true,
    recordedAt: true,
  };
  if (await hasReceivedAt()) select.receivedAt = true;
  const rows = await prisma.telemetryRecord.findMany({
    where: { recordedAt: { lt: cutoff } },
    select: select as { installationId: true; recordedAt: true },
    orderBy: { recordedAt: "asc" },
    take: 20_001,
  });
  const truncated = rows.length > 20_000;
  const page = truncated ? rows.slice(0, 20_000) : rows;
  const buckets = new Map<string, HourBucket>();
  for (const row of page) {
    const recordedAt = row.recordedAt;
    const bucketStart = kstHourStart(recordedAt);
    const installationId = row.installationId;
    const key = `${installationId}|${bucketStart.toISOString()}`;
    const bucket = buckets.get(key) ?? { installationId, bucketStart, rows: [] };
    const received = (row as { receivedAt?: Date | null }).receivedAt ?? null;
    bucket.rows.push({ recordedAt, receivedAt: received });
    buckets.set(key, bucket);
  }

  const ready = await summarySchemaReady();
  const reasons: Record<string, number> = {};
  const eligible: HourBucket[] = [];
  let eligibleRows = 0;
  let blockedRows = 0;
  let eligibleFrom: Date | null = null;
  let eligibleTo: Date | null = null;

  const byInstallation = new Map<string, HourBucket[]>();
  for (const bucket of buckets.values()) {
    const list = byInstallation.get(bucket.installationId) ?? [];
    list.push(bucket);
    byInstallation.set(bucket.installationId, list);
  }

  for (const [installationId, groups] of byInstallation) {
    const hourlyRows = ready
      ? await prisma.telemetryHourlySummary.findMany({
          where: {
            installationId,
            bucketStart: { in: groups.map((group) => group.bucketStart) },
          },
        })
      : [];
    const dailyRows = ready
      ? await prisma.telemetryDailySummary.findMany({
          where: {
            installationId,
            bucketStart: {
              in: [...new Set(groups.map((group) => kstDayStart(group.bucketStart).toISOString()))].map(
                (iso) => new Date(iso),
              ),
            },
          },
        })
      : [];
    const hourlyByTime = new Map(hourlyRows.map((row) => [row.bucketStart.toISOString(), row]));
    const dailyByTime = new Map(dailyRows.map((row) => [row.bucketStart.toISOString(), row]));

    for (const group of groups) {
      const deduped = new Set(group.rows.map((row) => row.recordedAt.getTime())).size;
      const latestRawAt = group.rows.reduce((latest, row) => {
        const stamp = row.receivedAt ?? row.recordedAt;
        return stamp > latest ? stamp : latest;
      }, group.rows[0].recordedAt);
      const hourly = hourlyByTime.get(group.bucketStart.toISOString());
      const daily = dailyByTime.get(kstDayStart(group.bucketStart).toISOString());
      const verdict = hourEligibleForPurge({
        rawSampleCount: deduped,
        hourlySampleCount: hourly?.sampleCount ?? null,
        hourlyUpdatedAt: hourly?.updatedAt ?? null,
        latestRawAt,
        dailyUpdatedAt: daily?.updatedAt ?? null,
      });
      if (!verdict.ok) {
        blockedRows += group.rows.length;
        reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + group.rows.length;
        continue;
      }
      eligible.push(group);
      eligibleRows += group.rows.length;
      if (!eligibleFrom || group.bucketStart < eligibleFrom) eligibleFrom = group.bucketStart;
      const hourEnd = addHours(group.bucketStart, 1);
      if (!eligibleTo || hourEnd > eligibleTo) eligibleTo = hourEnd;
    }
  }

  let hourlyPastRetention = 0;
  let dailyPastRetention = 0;
  if (ready) {
    const hourlyCutoff = new Date(now.getTime() - cfg.hourlyDays * 86_400_000);
    const dailyCutoff = new Date(now.getTime() - cfg.dailyDays * 86_400_000);
    hourlyPastRetention = await prisma.telemetryHourlySummary.count({
      where: { bucketStart: { lt: hourlyCutoff } },
    });
    dailyPastRetention = await prisma.telemetryDailySummary.count({
      where: { bucketStart: { lt: dailyCutoff } },
    });
  }

  return {
    eligible,
    report: {
      rawPurgeEnabled: cfg.rawPurgeEnabled,
      summaryPurgeEnabled: cfg.summaryPurgeEnabled,
      rawDays: cfg.rawDays,
      hourlyDays: cfg.hourlyDays,
      dailyDays: cfg.dailyDays,
      cutoff: cutoff.toISOString(),
      scannedRows: page.length,
      eligibleRows,
      blockedRows,
      blockedReasons: reasons,
      eligibleFrom: eligibleFrom?.toISOString() ?? null,
      eligibleTo: eligibleTo?.toISOString() ?? null,
      truncated,
      hourlyPastRetention,
      dailyPastRetention,
    },
  };
}

export async function inspectRetention(now = new Date()): Promise<RetentionReport> {
  if (!(await summarySchemaReady())) {
    const cfg = retentionConfig();
    return {
      rawPurgeEnabled: cfg.rawPurgeEnabled,
      summaryPurgeEnabled: cfg.summaryPurgeEnabled,
      rawDays: cfg.rawDays,
      hourlyDays: cfg.hourlyDays,
      dailyDays: cfg.dailyDays,
      cutoff: new Date(now.getTime() - cfg.rawDays * 86_400_000).toISOString(),
      scannedRows: 0,
      eligibleRows: 0,
      blockedRows: 0,
      blockedReasons: { missingHourly: 0 },
      eligibleFrom: null,
      eligibleTo: null,
      truncated: false,
      hourlyPastRetention: 0,
      dailyPastRetention: 0,
      deletedRows: 0,
    };
  }
  const { report } = await scanRawPurge(now);
  return { ...report, deletedRows: 0 };
}

export async function purgeIfEnabled(
  now = new Date(),
  options: { log?: boolean } = {},
): Promise<RetentionReport> {
  const cfg = retentionConfig();
  const scanned = await scanRawPurge(now);
  let deletedRows = 0;
  if (cfg.rawPurgeEnabled) {
    for (const bucket of scanned.eligible) {
      const result = await prisma.telemetryRecord.deleteMany({
        where: {
          installationId: bucket.installationId,
          recordedAt: { gte: bucket.bucketStart, lt: addHours(bucket.bucketStart, 1) },
        },
      });
      deletedRows += result.count;
    }
  }
  if (cfg.summaryPurgeEnabled && (await summarySchemaReady())) {
    const hourlyCutoff = new Date(now.getTime() - cfg.hourlyDays * 86_400_000);
    const dailyCutoff = new Date(now.getTime() - cfg.dailyDays * 86_400_000);
    await prisma.telemetryHourlySummary.deleteMany({
      where: { bucketStart: { lt: hourlyCutoff } },
    });
    await prisma.telemetryDailySummary.deleteMany({
      where: { bucketStart: { lt: dailyCutoff } },
    });
  }
  const report = { ...scanned.report, deletedRows };
  if (options.log !== false) {
    await logAggregation(
      "purge",
      cfg.rawPurgeEnabled ? "deleted" : "dry-run",
      cfg.rawPurgeEnabled
        ? `원본 ${deletedRows}행 삭제`
        : "원본 자동 삭제가 꺼져 있어 삭제하지 않았습니다.",
      report as unknown as Prisma.InputJsonValue,
    );
  }
  return report;
}

async function refreshLateHours(now: Date, lateFrom: Date, intervalMs: number, retainBefore: Date) {
  if (!(await hasReceivedAt())) return;
  const rows = await prisma.telemetryRecord.findMany({
    where: {
      receivedAt: { gte: new Date(now.getTime() - retentionConfig().lateHours * 3_600_000) },
      recordedAt: { lt: lateFrom },
    },
    select: { installationId: true, recordedAt: true },
    take: 5000,
  });
  const open = kstHourStart(now).getTime();
  const byInstallation = new Map<string, Date[]>();
  for (const row of rows) {
    const hour = kstHourStart(row.recordedAt);
    if (hour.getTime() >= open) continue;
    const list = byInstallation.get(row.installationId) ?? [];
    if (!list.some((item) => item.getTime() === hour.getTime())) list.push(hour);
    byInstallation.set(row.installationId, list);
  }
  for (const [installationId, hours] of byInstallation) {
    const sorted = hours.sort((a, b) => a.getTime() - b.getTime());
    const span = sorted[sorted.length - 1].getTime() - sorted[0].getTime();
    if (span <= 3 * 86_400_000) {
      await rebuildInstallation(
        installationId,
        sorted[0],
        addHours(sorted[sorted.length - 1], 1),
        intervalMs,
        retainBefore,
      );
    } else {
      for (const hour of sorted) {
        await rebuildInstallation(installationId, hour, addHours(hour, 1), intervalMs, retainBefore);
      }
    }
  }
}

export async function runAggregationPass(): Promise<{
  ok: boolean;
  message: string;
  detail?: Record<string, unknown>;
}> {
  const cfg = retentionConfig();
  if (!cfg.aggregationEnabled) {
    return { ok: true, message: "aggregation disabled" };
  }
  if (!(await summarySchemaReady())) {
    return { ok: false, message: SUMMARY_MISSING };
  }

  const token = await acquireLease(Math.max(cfg.tickMs, 120_000));
  if (!token) return { ok: true, message: "lease held" };

  try {
    const now = new Date();
    const intervalMs = cfg.intervalMinutes * 60 * 1000;
    const retainBefore = new Date(now.getTime() - cfg.rawDays * 86_400_000);
    const closedEnd = kstHourStart(now);
    const lateFrom = new Date(closedEnd.getTime() - cfg.lateHours * 3_600_000);

    const lateIds = await installationsBetween(lateFrom, closedEnd);
    for (const installationId of lateIds) {
      await rebuildInstallation(installationId, lateFrom, closedEnd, intervalMs, retainBefore);
    }
    await refreshLateHours(now, lateFrom, intervalMs, retainBefore);

    const watermarkRaw = await readState("hourlyWatermark");
    const earliest = watermarkRaw
      ? new Date(watermarkRaw)
      : (
          await prisma.telemetryRecord.findFirst({
            orderBy: { recordedAt: "asc" },
            select: { recordedAt: true },
          })
        )?.recordedAt ?? null;

    let backfillTo: string | null = null;
    if (earliest && kstHourStart(earliest) < lateFrom) {
      const start = kstHourStart(earliest);
      let chunkEnd = new Date(Math.min(lateFrom.getTime(), start.getTime() + 14 * 86_400_000));
      chunkEnd = kstHourStart(chunkEnd);
      if (chunkEnd.getTime() <= start.getTime()) chunkEnd = addHours(start, 1);
      const ids = await installationsBetween(start, chunkEnd);
      for (const installationId of ids) {
        await rebuildInstallation(installationId, start, chunkEnd, intervalMs, retainBefore);
      }
      await writeState("hourlyWatermark", chunkEnd.toISOString());
      backfillTo = chunkEnd.toISOString();
    } else if (!watermarkRaw) {
      await writeState("hourlyWatermark", closedEnd.toISOString());
      backfillTo = closedEnd.toISOString();
    }

    const today = kstDateKey(now);
    const purgeCheckedOn = await readState("purgeCheckedOn");
    const purge =
      purgeCheckedOn === today
        ? null
        : await purgeIfEnabled(now);
    if (purgeCheckedOn !== today) await writeState("purgeCheckedOn", today);
    const detail = {
      lateInstallations: lateIds.length,
      backfillTo,
      eligibleRows: purge?.eligibleRows ?? null,
      blockedRows: purge?.blockedRows ?? null,
      deletedRows: purge?.deletedRows ?? 0,
      rawPurgeEnabled: cfg.rawPurgeEnabled,
    };
    if (backfillTo || (purge && purge.deletedRows > 0) || purge?.blockedRows) {
      await logAggregation("aggregate", "ok", "집계 패스 완료", detail);
    }
    return { ok: true, message: "pass complete", detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAggregation("aggregate", "error", message);
    return { ok: false, message };
  } finally {
    await releaseLease(token);
  }
}

export type HistoryResult = {
  installationId: string;
  period: ResolvedHistory["period"];
  aggregation: ResolvedHistory["aggregation"];
  resolution: ResolvedHistory["resolution"];
  source: "raw" | "hourly" | "daily";
  from: string;
  to: string;
  sampleCount: number;
  expectedCount: number;
  coverage: number | null;
  gapCount: number;
  energy: { uncompKwh: number | null; compKwh: number | null; estimated: true };
  points: HistoryPoint[];
};

export async function getDeviceHistory(
  installationId: string,
  query: ResolvedHistory,
): Promise<HistoryResult> {
  const cfg = retentionConfig();
  const intervalMs = cfg.intervalMinutes * 60 * 1000;
  const base = {
    installationId,
    period: query.period,
    aggregation: query.aggregation,
    resolution: query.resolution,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
  };

  if (query.resolution !== "raw" && (await summarySchemaReady())) {
    const floor = query.resolution === "hourly" ? kstHourStart(query.from) : kstDayStart(query.from);
    const rows =
      query.resolution === "hourly"
        ? await prisma.telemetryHourlySummary.findMany({
            where: { installationId, bucketStart: { gte: floor, lt: query.to } },
            orderBy: { bucketStart: "asc" },
          })
        : await prisma.telemetryDailySummary.findMany({
            where: { installationId, bucketStart: { gte: floor, lt: query.to } },
            orderBy: { bucketStart: "asc" },
          });
    const built = buildHistoryFromSummaries({
      rows: rows.map((row) => ({ bucketStart: row.bucketStart, payload: asPayload(row) })),
      installationId,
      resolution: query.resolution,
      aggregation: query.aggregation,
      from: query.from,
      to: query.to,
      intervalMs,
    });
    const watermark = await readState("hourlyWatermark");
    const lateFrom = new Date(kstHourStart(new Date()).getTime() - cfg.lateHours * 3_600_000);
    const caughtUp = watermark != null && new Date(watermark).getTime() >= lateFrom.getTime() - 3_600_000;
    const rawCount = await prisma.telemetryRecord.count({
      where: { installationId, recordedAt: { gte: query.from, lt: query.to } },
    });
    const trustSummaries =
      rows.length > 0 && (caughtUp || rawCount === 0 || rawCount > 80_000);
    if (trustSummaries) {
      return { ...base, source: query.resolution, ...built };
    }
  }

  const samples = await loadSamples(installationId, query.from, query.to);
  const built = buildHistoryFromSamples({
    samples,
    installationId,
    resolution: query.resolution,
    aggregation: query.aggregation,
    from: query.from,
    to: query.to,
    intervalMs,
  });
  return { ...base, source: "raw", ...built };
}
