-- 상태는 moduleStatus로부터 API 레이어에서 deriveDeviceStatus로 계산
ALTER TABLE "Device" DROP COLUMN IF EXISTS "status";
