DROP INDEX "supplier_price_changes_import_idx";--> statement-breakpoint
DROP INDEX "supplier_price_changes_product_idx";--> statement-breakpoint
DROP INDEX "supplier_products_item_no_unique";--> statement-breakpoint
DROP INDEX "supplier_products_first_import_idx";--> statement-breakpoint
DROP INDEX "supplier_products_description_idx";--> statement-breakpoint
ALTER TABLE `supplier_products` ALTER COLUMN "unit_of_measure" TO "unit_of_measure" text;--> statement-breakpoint
CREATE INDEX `supplier_price_changes_import_idx` ON `supplier_price_changes` (`import_id`);--> statement-breakpoint
CREATE INDEX `supplier_price_changes_product_idx` ON `supplier_price_changes` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_products_item_no_unique` ON `supplier_products` (`item_no`);--> statement-breakpoint
CREATE INDEX `supplier_products_first_import_idx` ON `supplier_products` (`first_import_id`);--> statement-breakpoint
CREATE INDEX `supplier_products_description_idx` ON `supplier_products` (`description`);