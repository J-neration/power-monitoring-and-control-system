-- Rated module capacity is a settings snapshot, not a time-series metric.
ALTER TABLE "TelemetryRecord" DROP COLUMN "moduleCapacity";
