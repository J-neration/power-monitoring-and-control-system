/*
  Warnings:

  - You are about to drop the column `capacity` on the `Installation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Installation" DROP COLUMN "capacity";

-- CreateTable
CREATE TABLE "TelemetryRecord" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moduleStatus" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "numOfMods" INTEGER,
    "vL1" DOUBLE PRECISION,
    "vL2" DOUBLE PRECISION,
    "vL3" DOUBLE PRECISION,
    "gridCurrentL1" DOUBLE PRECISION,
    "gridCurrentL2" DOUBLE PRECISION,
    "gridCurrentL3" DOUBLE PRECISION,
    "loadCurrentL1" DOUBLE PRECISION,
    "loadCurrentL2" DOUBLE PRECISION,
    "loadCurrentL3" DOUBLE PRECISION,
    "loadCurrentTHDL1" DOUBLE PRECISION,
    "loadCurrentTHDL2" DOUBLE PRECISION,
    "loadCurrentTHDL3" DOUBLE PRECISION,
    "gridCurrentTHDL1" DOUBLE PRECISION,
    "gridCurrentTHDL2" DOUBLE PRECISION,
    "gridCurrentTHDL3" DOUBLE PRECISION,
    "uncompS" DOUBLE PRECISION,
    "compS" DOUBLE PRECISION,
    "uncompP" DOUBLE PRECISION,
    "compP" DOUBLE PRECISION,
    "uncompQ" DOUBLE PRECISION,
    "compQ" DOUBLE PRECISION,
    "uncompH" DOUBLE PRECISION,
    "compH" DOUBLE PRECISION,
    "tpf1" DOUBLE PRECISION,
    "tpf2" DOUBLE PRECISION,
    "dpf1" DOUBLE PRECISION,
    "dpf2" DOUBLE PRECISION,

    CONSTRAINT "TelemetryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetryRecord_installationId_recordedAt_idx" ON "TelemetryRecord"("installationId", "recordedAt");

-- AddForeignKey
ALTER TABLE "TelemetryRecord" ADD CONSTRAINT "TelemetryRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
