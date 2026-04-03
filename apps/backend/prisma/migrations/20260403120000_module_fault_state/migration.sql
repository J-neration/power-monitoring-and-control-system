-- CreateTable
CREATE TABLE "ModuleFaultState" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "faultCode" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "lastEvent" VARCHAR(16) NOT NULL,
    "criticalChannel" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleFaultState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleFaultState_installationId_faultCode_key" ON "ModuleFaultState"("installationId", "faultCode");

-- CreateIndex
CREATE INDEX "ModuleFaultState_installationId_resolvedAt_idx" ON "ModuleFaultState"("installationId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "ModuleFaultState" ADD CONSTRAINT "ModuleFaultState_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
