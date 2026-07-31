-- AlterTable
ALTER TABLE "Installation" ADD COLUMN "adminSessionActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Installation" ADD COLUMN "adminSessionHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "Installation" ADD COLUMN "adminSessionUserId" TEXT;
