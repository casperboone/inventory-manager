CREATE TABLE `assortment_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assortment_categories_name_unique` ON `assortment_categories` (`name`);--> statement-breakpoint
CREATE TABLE `assortment_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`name` text NOT NULL,
	`supplier_product_id` integer,
	`target` real,
	`quantity_to_buy` real DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`note` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `assortment_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assortment_items_category_idx` ON `assortment_items` (`category_id`,`position`);--> statement-breakpoint
CREATE INDEX `assortment_items_supplier_idx` ON `assortment_items` (`supplier_product_id`);