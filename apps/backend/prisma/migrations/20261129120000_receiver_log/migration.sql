-- HMI ↔ 서버 송수신 원문 (어드민 통신 로그). 짧게 보관 (기본 7일).
CREATE TABLE "ReceiverLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "iccid" VARCHAR(32),
    "ip" VARCHAR(64),
    "requestBody" TEXT,
    "responseBody" TEXT,

    CONSTRAINT "ReceiverLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceiverLog_createdAt_idx" ON "ReceiverLog"("createdAt");
CREATE INDEX "ReceiverLog_iccid_createdAt_idx" ON "ReceiverLog"("iccid", "createdAt");
