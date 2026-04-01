-- HMI 식별: USIM ICCID → Installation.id 매핑 (운영에서 installation별로 등록)
ALTER TABLE "Installation" ADD COLUMN IF NOT EXISTS "iccid" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Installation_iccid_key" ON "Installation" ("iccid");
