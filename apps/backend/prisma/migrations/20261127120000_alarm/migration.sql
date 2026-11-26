-- 관제 알람: 발생·해제·확인 기록 (대시보드 알람 목록, 서버 확인 기록).
CREATE TABLE "Alarm" (
    "id" SERIAL NOT NULL,
    "installationId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "ackedBy" VARCHAR(64),
    "ackNote" VARCHAR(200),

    CONSTRAINT "Alarm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Alarm_installationId_kind_clearedAt_idx" ON "Alarm"("installationId", "kind", "clearedAt");
CREATE INDEX "Alarm_clearedAt_ackedAt_idx" ON "Alarm"("clearedAt", "ackedAt");
CREATE INDEX "Alarm_raisedAt_idx" ON "Alarm"("raisedAt");

ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
