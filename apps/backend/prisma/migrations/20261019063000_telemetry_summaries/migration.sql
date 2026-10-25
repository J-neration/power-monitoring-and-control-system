-- 측정 시각(recordedAt)과 수신 시각을 구분한다.
-- 컬럼은 nullable 이라 기존 INSERT(트리거 적용 전 서버)도 그대로 동작한다.
ALTER TABLE "TelemetryRecord" ADD COLUMN "receivedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION "telemetry_set_received_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."receivedAt" IS NULL THEN
    NEW."receivedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "telemetry_received_at" ON "TelemetryRecord";
CREATE TRIGGER "telemetry_received_at"
BEFORE INSERT ON "TelemetryRecord"
FOR EACH ROW
EXECUTE FUNCTION "telemetry_set_received_at"();

-- 보관 기간 초과 행을 측정 시각으로 찾을 때 사용
CREATE INDEX "TelemetryRecord_recordedAt_idx" ON "TelemetryRecord"("recordedAt");

-- CreateTable
CREATE TABLE "TelemetryHourlySummary" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL,
    "metrics" JSONB NOT NULL,
    "arrayMetrics" JSONB NOT NULL,
    "uncompEnergyKwh" DOUBLE PRECISION,
    "compEnergyKwh" DOUBLE PRECISION,
    "energyEstimated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemetryHourlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryDailySummary" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL,
    "metrics" JSONB NOT NULL,
    "arrayMetrics" JSONB NOT NULL,
    "uncompEnergyKwh" DOUBLE PRECISION,
    "compEnergyKwh" DOUBLE PRECISION,
    "energyEstimated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemetryDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregationState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregationState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AggregationLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryHourlySummary_installationId_bucketStart_key" ON "TelemetryHourlySummary"("installationId", "bucketStart");

-- CreateIndex
CREATE INDEX "TelemetryHourlySummary_bucketStart_idx" ON "TelemetryHourlySummary"("bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryDailySummary_installationId_bucketStart_key" ON "TelemetryDailySummary"("installationId", "bucketStart");

-- CreateIndex
CREATE INDEX "TelemetryDailySummary_bucketStart_idx" ON "TelemetryDailySummary"("bucketStart");

-- CreateIndex
CREATE INDEX "AggregationLog_kind_createdAt_idx" ON "AggregationLog"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "TelemetryHourlySummary" ADD CONSTRAINT "TelemetryHourlySummary_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryDailySummary" ADD CONSTRAINT "TelemetryDailySummary_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
