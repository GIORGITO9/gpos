ALTER TABLE `Order` ADD COLUMN `taxRate` INTEGER NULL;

CREATE TABLE `OrderRound` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CONFIRMADO',
    `requestKey` VARCHAR(191) NULL,
    `requestHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `OrderRound_orderId_sequence_key`(`orderId`, `sequence`),
    UNIQUE INDEX `OrderRound_orderId_requestKey_key`(`orderId`, `requestKey`),
    PRIMARY KEY (`id`),
    CONSTRAINT `OrderRound_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrderItem` ADD COLUMN `roundId` VARCHAR(191) NULL;
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `OrderRound`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
