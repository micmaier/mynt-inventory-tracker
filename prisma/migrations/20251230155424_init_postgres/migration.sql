-- CreateTable
CREATE TABLE "InventoryStart" (
    "id" TEXT NOT NULL,
    "baseType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "startQty" INTEGER NOT NULL DEFAULT 0,
    "minQty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderCreatedAt" TIMESTAMP(3) NOT NULL,
    "baseType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qtyUsed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBaseTagCache" (
    "productId" TEXT NOT NULL,
    "baseType" TEXT,
    "tagsRaw" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBaseTagCache_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "ProcessedOrder" (
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "orderCreatedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedOrder_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "InventorySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultFrom" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryStart_baseType_category_idx" ON "InventoryStart"("baseType", "category");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStart_baseType_category_size_key" ON "InventoryStart"("baseType", "category", "size");

-- CreateIndex
CREATE INDEX "InventoryMovement_orderCreatedAt_idx" ON "InventoryMovement"("orderCreatedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_baseType_category_size_idx" ON "InventoryMovement"("baseType", "category", "size");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_orderId_baseType_category_size_key" ON "InventoryMovement"("orderId", "baseType", "category", "size");

-- CreateIndex
CREATE INDEX "ProcessedOrder_orderCreatedAt_idx" ON "ProcessedOrder"("orderCreatedAt");
