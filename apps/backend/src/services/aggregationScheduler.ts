import type { FastifyBaseLogger } from "fastify";
import { retentionConfig } from "../lib/retentionConfig.js";
import { runAggregationPass } from "./summaryService.js";

const MISSING = "SUMMARY_SCHEMA_MISSING";

/** 프로세스 안 스케줄러. 재시작되면 워터마크부터 이어 가고, 리스로 중복 실행을 막는다. */
export function startAggregationScheduler(log: FastifyBaseLogger): () => void {
  const cfg = retentionConfig();
  if (!cfg.aggregationEnabled) {
    log.info("telemetry aggregation is disabled (AGGREGATION_ENABLED=false)");
    return () => {};
  }

  let running = false;
  let announcedMissing = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runAggregationPass();
      if (result.message === MISSING) {
        if (!announcedMissing) {
          announcedMissing = true;
          log.warn(
            "Telemetry summary tables are missing. Apply prisma migrate deploy before aggregation. Raw ingest is unchanged.",
          );
        }
        return;
      }
      if (!result.ok) {
        log.error({ message: result.message }, "telemetry aggregation failed");
        return;
      }
      log.info({ detail: result.detail, message: result.message }, "telemetry aggregation pass");
    } catch (error) {
      log.error(error, "telemetry aggregation crashed");
    } finally {
      running = false;
    }
  };

  const starter = setTimeout(() => void tick(), 15_000);
  const timer = setInterval(() => void tick(), cfg.tickMs);
  starter.unref?.();
  timer.unref?.();

  return () => {
    clearTimeout(starter);
    clearInterval(timer);
  };
}
