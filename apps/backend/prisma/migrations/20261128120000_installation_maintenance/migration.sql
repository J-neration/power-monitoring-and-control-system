-- 관제 "점검 중": 설비 알람을 띠·미확인 수·알람음에서 잠시 뺀다.
ALTER TABLE "Installation" ADD COLUMN "maintenanceSince" TIMESTAMP(3);
ALTER TABLE "Installation" ADD COLUMN "maintenanceUntil" TIMESTAMP(3);
ALTER TABLE "Installation" ADD COLUMN "maintenanceBy" VARCHAR(64);
ALTER TABLE "Installation" ADD COLUMN "maintenanceNote" VARCHAR(200);
