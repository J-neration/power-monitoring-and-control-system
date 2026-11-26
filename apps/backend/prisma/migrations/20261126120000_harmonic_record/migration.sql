-- AlterEnum
ALTER TYPE "DeviceCommandPower" ADD VALUE 'refreshHarmonics';

-- CreateTable
CREATE TABLE "HarmonicRecord" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'hourly',
    "orders" INTEGER[],
    "uncompA" INTEGER[],
    "uncompB" INTEGER[],
    "uncompC" INTEGER[],
    "compA" INTEGER[],
    "compB" INTEGER[],
    "compC" INTEGER[],

    CONSTRAINT "HarmonicRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HarmonicRecord_installationId_recordedAt_idx" ON "HarmonicRecord"("installationId", "recordedAt");

-- AddForeignKey
ALTER TABLE "HarmonicRecord" ADD CONSTRAINT "HarmonicRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
