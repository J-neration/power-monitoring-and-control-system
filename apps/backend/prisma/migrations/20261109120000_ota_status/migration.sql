-- HMI OTA 상태 보고(롤백 포함)와 텔레메트리의 펌웨어 버전.
ALTER TABLE "Device" ADD COLUMN "fwVersion" TEXT;
ALTER TABLE "Device" ADD COLUMN "otaCapable" BOOLEAN;
ALTER TABLE "Device" ADD COLUMN "otaState" TEXT;

CREATE TABLE "OtaStatusEvent" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "commandId" TEXT,
    "state" TEXT NOT NULL,
    "percent" INTEGER,
    "fw" TEXT,
    "target" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtaStatusEvent_installationId_createdAt_idx" ON "OtaStatusEvent"("installationId", "createdAt");

ALTER TABLE "OtaStatusEvent" ADD CONSTRAINT "OtaStatusEvent_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
