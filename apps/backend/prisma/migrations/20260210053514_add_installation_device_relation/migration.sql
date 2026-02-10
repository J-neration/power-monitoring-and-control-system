-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "installationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "moduleStatus" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "numOfMods" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastValue" DOUBLE PRECISION,
    "lastIp" TEXT DEFAULT 'unknown',
    "vL1" DOUBLE PRECISION,
    "vL2" DOUBLE PRECISION,
    "vL3" DOUBLE PRECISION,
    "gridCurrentL1" DOUBLE PRECISION,
    "gridCurrentL2" DOUBLE PRECISION,
    "gridCurrentL3" DOUBLE PRECISION,
    "loadCurrentL1" DOUBLE PRECISION,
    "loadCurrentL2" DOUBLE PRECISION,
    "loadCurrentL3" DOUBLE PRECISION,
    "loadCurrentTHDL1" DOUBLE PRECISION,
    "loadCurrentTHDL2" DOUBLE PRECISION,
    "loadCurrentTHDL3" DOUBLE PRECISION,
    "uncompS" DOUBLE PRECISION,
    "uncompP" DOUBLE PRECISION,
    "uncompQ" DOUBLE PRECISION,
    "uncompH" DOUBLE PRECISION,
    "compS" DOUBLE PRECISION,
    "compP" DOUBLE PRECISION,
    "compQ" DOUBLE PRECISION,
    "compH" DOUBLE PRECISION,
    "tpf1" DOUBLE PRECISION,
    "tpf2" DOUBLE PRECISION,
    "dpf1" DOUBLE PRECISION,
    "dpf2" DOUBLE PRECISION,
    "gridCurrentTHDL1" DOUBLE PRECISION,
    "gridCurrentTHDL2" DOUBLE PRECISION,
    "gridCurrentTHDL3" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("installationId")
);

-- CreateIndex
CREATE INDEX "Installation_siteId_idx" ON "Installation"("siteId");

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
