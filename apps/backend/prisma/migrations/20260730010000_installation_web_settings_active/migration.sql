-- AlterTable
ALTER TABLE "Installation" ADD COLUMN "webSettingsActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Installation" ADD COLUMN "webSettingsHeartbeatAt" TIMESTAMP(3);
