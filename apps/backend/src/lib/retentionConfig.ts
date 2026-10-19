/**
 * 보관 기간과 집계 스위치. 코드에 일수를 고정하지 않는다.
 *
 * RAW_DATA_RETENTION_DAYS=180
 * HOURLY_DATA_RETENTION_DAYS=365
 * DAILY_DATA_RETENTION_DAYS=1825
 * RAW_SAMPLE_INTERVAL_MINUTES=10
 * RAW_PURGE_ENABLED=false          원본 자동 삭제. 기본 꺼짐
 * SUMMARY_PURGE_ENABLED=false      요약 보관기간 초과 삭제. 기본 꺼짐
 * AGGREGATION_ENABLED=true
 * AGGREGATION_LATE_HOURS=48        지연 수신을 다시 집계하는 시간
 * AGGREGATION_TICK_MS=600000
 */

export type RetentionConfig = {
  rawDays: number;
  hourlyDays: number;
  dailyDays: number;
  intervalMinutes: number;
  rawPurgeEnabled: boolean;
  summaryPurgeEnabled: boolean;
  aggregationEnabled: boolean;
  lateHours: number;
  tickMs: number;
};

function intEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function boolEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: boolean,
): boolean {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

export function retentionConfigFrom(
  env: Record<string, string | undefined>,
): RetentionConfig {
  return {
    rawDays: intEnv(env, "RAW_DATA_RETENTION_DAYS", 180, 1, 3650),
    hourlyDays: intEnv(env, "HOURLY_DATA_RETENTION_DAYS", 365, 1, 3650),
    dailyDays: intEnv(env, "DAILY_DATA_RETENTION_DAYS", 1825, 1, 20000),
    intervalMinutes: intEnv(env, "RAW_SAMPLE_INTERVAL_MINUTES", 10, 1, 60),
    rawPurgeEnabled: boolEnv(env, "RAW_PURGE_ENABLED", false),
    summaryPurgeEnabled: boolEnv(env, "SUMMARY_PURGE_ENABLED", false),
    aggregationEnabled: boolEnv(env, "AGGREGATION_ENABLED", true),
    lateHours: intEnv(env, "AGGREGATION_LATE_HOURS", 48, 1, 24 * 30),
    tickMs: intEnv(env, "AGGREGATION_TICK_MS", 10 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000),
  };
}

export function retentionConfig(): RetentionConfig {
  return retentionConfigFrom(process.env);
}
