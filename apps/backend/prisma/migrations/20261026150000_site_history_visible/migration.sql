-- 연간 구독 현장만 이력 그래프(일/주/월/연)를 본다. 기본은 숨김.
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "historyVisible" BOOLEAN NOT NULL DEFAULT false;
