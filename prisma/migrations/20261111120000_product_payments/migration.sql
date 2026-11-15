ALTER TABLE `OrderItem` ADD COLUMN `stockApplied` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `settlementTotal` INTEGER NULL;
ALTER TABLE `Payment` ADD COLUMN `items` JSON NULL;

UPDATE `OrderItem` AS item
JOIN `Order` AS orders ON orders.id = item.orderId
SET item.stockApplied = true
WHERE orders.stockApplied = true;
