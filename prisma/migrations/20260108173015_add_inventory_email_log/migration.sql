-- CreateTable
CREATE TABLE "InventoryEmailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "forDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criticalCnt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryEmailLog_forDate_idx" ON "InventoryEmailLog"("forDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryEmailLog_kind_forDate_key" ON "InventoryEmailLog"("kind", "forDate");
