-- 이력 그래프 보이기/숨기기를 현장이 아니라 설치지점 단위로 옮긴다.
ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "historyVisible" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Site'
      AND column_name = 'historyVisible'
  ) THEN
    UPDATE "Installation" AS i
    SET "historyVisible" = s."historyVisible"
    FROM "Site" AS s
    WHERE i."siteId" = s.id
      AND s."historyVisible" = true;

    ALTER TABLE "Site" DROP COLUMN "historyVisible";
  END IF;
END $$;
