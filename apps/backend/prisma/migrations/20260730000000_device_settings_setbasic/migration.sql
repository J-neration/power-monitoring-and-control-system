-- AlterEnum
ALTER TYPE "DeviceCommandPower" ADD VALUE 'setBasic';

-- AlterTable
ALTER TABLE "DeviceCommand" ADD COLUMN "fields" JSONB;

-- CreateTable
CREATE TABLE "InstallationDeviceSettings" (
    "installationId" TEXT NOT NULL,
    "moduleType" TEXT NOT NULL,
    "numOfMods" INTEGER NOT NULL DEFAULT 0,
    "basic" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationDeviceSettings_pkey" PRIMARY KEY ("installationId")
);

-- AddForeignKey
ALTER TABLE "InstallationDeviceSettings" ADD CONSTRAINT "InstallationDeviceSettings_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
