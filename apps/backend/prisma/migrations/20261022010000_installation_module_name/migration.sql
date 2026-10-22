-- 설치지점 모듈명 (선택). 예: PAF 400Y-100C
ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "moduleName" TEXT;
