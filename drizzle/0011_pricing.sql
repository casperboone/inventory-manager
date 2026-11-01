CREATE TABLE `pricing_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`base_margin` real NOT NULL,
	`pivot_price` real NOT NULL,
	`premium_margin` real NOT NULL,
	`wastage` real DEFAULT 0 NOT NULL,
	`vat_rate` real DEFAULT 0.21 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_categories_name_unique` ON `pricing_categories` (`name`);--> statement-breakpoint
CREATE TABLE `pricing_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`price_rounding` real DEFAULT 0.1 NOT NULL,
	`advice_tolerance` real DEFAULT 0.1 NOT NULL,
	`alcohol_reference_item_id` integer
);
--> statement-breakpoint
CREATE TABLE `sale_price_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`old_price` real,
	`new_price` real,
	`cost` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `assortment_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sale_price_changes_item_idx` ON `sale_price_changes` (`item_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `pricing_category_id` integer REFERENCES pricing_categories(id);--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `not_for_sale` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `unit_volume` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `portion_volume` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `portions_per_unit` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `alcohol_percentage` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `vat_rate` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `manual_purchase_price` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `purchase_source` text;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `sale_price` real;--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `sale_price_cost` real;