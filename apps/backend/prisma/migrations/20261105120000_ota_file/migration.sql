-- HMI 무선 업데이트(OTA) 파일. HMI 는 /receiver/ota/file/:id?t=<downloadToken> 으로 Range 다운로드한다.
CREATE TABLE "OtaFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "downloadToken" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OtaFile_downloadToken_key" ON "OtaFile"("downloadToken");
