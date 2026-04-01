-- Create enums for command power/status
CREATE TYPE "DeviceCommandPower" AS ENUM ('on', 'off');
CREATE TYPE "DeviceCommandStatus" AS ENUM ('pending', 'sent', 'acked', 'failed', 'expired', 'cancelled');

-- Create command table
CREATE TABLE "DeviceCommand" (
  "id" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "module" INTEGER NOT NULL,
  "power" "DeviceCommandPower" NOT NULL,
  "status" "DeviceCommandStatus" NOT NULL DEFAULT 'pending',
  "requestedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "ackedAt" TIMESTAMP(3),
  "ackMessage" TEXT,
  "expiresAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "DeviceCommand_installationId_status_createdAt_idx"
  ON "DeviceCommand"("installationId", "status", "createdAt");

CREATE INDEX "DeviceCommand_installationId_module_status_createdAt_idx"
  ON "DeviceCommand"("installationId", "module", "status", "createdAt");

-- FK
ALTER TABLE "DeviceCommand"
  ADD CONSTRAINT "DeviceCommand_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "Installation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
