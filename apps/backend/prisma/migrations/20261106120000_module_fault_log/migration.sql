-- /receiver/faults* RAISE/CLEAR 수신 로그 (추가 전용). ModuleFaultState 는 현재 상태만 덮어쓴다.
CREATE TABLE "ModuleFaultLog" (
    "id" SERIAL NOT NULL,
    "installationId" TEXT NOT NULL,
    "faultCode" INTEGER NOT NULL,
    "event" VARCHAR(16) NOT NULL,
    "eventName" VARCHAR(64),
    "criticalChannel" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleFaultLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModuleFaultLog_installationId_occurredAt_idx" ON "ModuleFaultLog"("installationId", "occurredAt");

ALTER TABLE "ModuleFaultLog" ADD CONSTRAINT "ModuleFaultLog_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
