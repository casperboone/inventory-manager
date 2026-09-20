CREATE TABLE `supplier_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`reported_count` integer,
	`fetched_count` integer,
	`new_count` integer,
	`updated_count` integer,
	`price_changed_count` integer,
	`removed_count` integer
);
--> statement-breakpoint
CREATE TABLE `supplier_price_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`import_id` integer NOT NULL,
	`old_price` real,
	`new_price` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `supplier_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `supplier_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_price_changes_import_idx` ON `supplier_price_changes` (`import_id`);--> statement-breakpoint
CREATE INDEX `supplier_price_changes_product_idx` ON `supplier_price_changes` (`product_id`);--> statement-breakpoint
CREATE TABLE `supplier_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_no` text NOT NULL,
	`supplier_id` integer,
	`description` text NOT NULL,
	`description2` text,
	`unit_of_measure` text NOT NULL,
	`qty_per_unit_of_measure` real,
	`integer_only` integer DEFAULT false NOT NULL,
	`unit_price` real,
	`gtin` text,
	`in_supplier_assortment` integer DEFAULT false NOT NULL,
	`raw` text,
	`first_import_id` integer,
	`last_seen_import_id` integer,
	`removed_at` integer,
	`removed_in_import_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`first_import_id`) REFERENCES `supplier_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_seen_import_id`) REFERENCES `supplier_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`removed_in_import_id`) REFERENCES `supplier_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_products_item_no_unique` ON `supplier_products` (`item_no`);--> statement-breakpoint
CREATE INDEX `supplier_products_first_import_idx` ON `supplier_products` (`first_import_id`);--> statement-breakpoint
CREATE INDEX `supplier_products_description_idx` ON `supplier_products` (`description`);