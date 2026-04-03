-- CreateTable
CREATE TABLE "FaultEvent" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "iccid" TEXT,
    "module" INTEGER NOT NULL,
    "desc" VARCHAR(48) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaultEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaultEvent_installationId_occurredAt_idx" ON "FaultEvent"("installationId", "occurredAt");

-- CreateIndex
CREATE INDEX "FaultEvent_iccid_occurredAt_idx" ON "FaultEvent"("iccid", "occurredAt");

-- AddForeignKey
ALTER TABLE "FaultEvent" ADD CONSTRAINT "FaultEvent_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
