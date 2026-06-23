-- CreateTable
CREATE TABLE "ClientOption" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleOption" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isAssignable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleOption_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOption_key_key" ON "ClientOption"("key");

-- CreateIndex
CREATE INDEX "ClientOption_isActive_sortOrder_idx" ON "ClientOption"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "RoleOption_isAssignable_sortOrder_idx" ON "RoleOption"("isAssignable", "sortOrder");
