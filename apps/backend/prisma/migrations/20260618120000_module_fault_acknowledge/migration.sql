-- AlterTable: 사용자 Acknowledge 추적 컬럼 추가
ALTER TABLE "ModuleFaultState" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "ModuleFaultState" ADD COLUMN "acknowledgedBy" VARCHAR(64);
