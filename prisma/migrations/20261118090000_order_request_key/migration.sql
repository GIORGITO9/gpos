-- AlterTable
ALTER TABLE `Order` ADD COLUMN `requestKey` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Order_tenantId_requestKey_key` ON `Order`(`tenantId`, `requestKey`);
