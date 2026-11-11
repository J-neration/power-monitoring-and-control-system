-- HMI 화면 데이터(TouchGFX) 번호와 화면 데이터 OTA 지원 여부 (HMI 저장소 docs/OTA_ASSET_PLAN.md 7.1).
ALTER TABLE "Device" ADD COLUMN "assetVersion" INTEGER;
ALTER TABLE "Device" ADD COLUMN "assetOta" BOOLEAN;
