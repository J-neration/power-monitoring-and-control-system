-- HMI 화면 데이터 패키지(매직 HMIA) 구분과 화면 OTA 단계 (HMI 저장소 docs/OTA_ASSET_PLAN.md 11.5, 단계 6).
ALTER TABLE "OtaFile" ADD COLUMN "kind" TEXT;
ALTER TABLE "OtaFile" ADD COLUMN "rawSha256" TEXT;
-- 지금까지 헤더가 있는 파일은 모두 코드 패키지다.
UPDATE "OtaFile" SET "kind" = 'code' WHERE "version" IS NOT NULL;
CREATE INDEX "OtaFile_kind_assetVersion_idx" ON "OtaFile"("kind", "assetVersion");

ALTER TABLE "OtaStatusEvent" ADD COLUMN "stage" TEXT;
