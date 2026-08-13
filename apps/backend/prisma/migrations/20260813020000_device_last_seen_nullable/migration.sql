-- lastSeenAt: 실제 수신이 있을 때만 설정 (설치 직후 미통신은 null)
ALTER TABLE "Device" ALTER COLUMN "lastSeenAt" DROP NOT NULL;
ALTER TABLE "Device" ALTER COLUMN "lastSeenAt" DROP DEFAULT;

-- 텔레메트리 기록이 없고 모듈 상태도 비어 있으면 장치는 미수신으로 간주
UPDATE "Device" AS d
SET "lastSeenAt" = NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM "TelemetryRecord" AS t
  WHERE t."installationId" = d."installationId"
)
AND cardinality(d."moduleStatus") = 0
AND d."numOfMods" = 0;
