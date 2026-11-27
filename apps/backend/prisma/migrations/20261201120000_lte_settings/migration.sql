-- AlterEnum: LTE telemetry POST period command (module 0, fields = { postPeriodMin })
ALTER TYPE "DeviceCommandPower" ADD VALUE 'setLte';

-- AlterTable: LTE settings reported by the HMI in POST /receiver/settings (null on older firmware)
ALTER TABLE "InstallationDeviceSettings" ADD COLUMN     "lte" JSONB;
