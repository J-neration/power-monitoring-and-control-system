-- HMI OTA 명령: 패키지 헤더 값을 파일에 저장하고 명령 종류에 ota 를 추가한다.
ALTER TABLE "OtaFile" ADD COLUMN "version" TEXT;
ALTER TABLE "OtaFile" ADD COLUMN "productId" INTEGER;
ALTER TABLE "OtaFile" ADD COLUMN "assetVersion" INTEGER;
ALTER TABLE "OtaFile" ADD COLUMN "imageSize" INTEGER;

ALTER TYPE "DeviceCommandPower" ADD VALUE 'ota';
