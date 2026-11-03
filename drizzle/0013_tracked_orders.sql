CREATE TABLE `order_document_rejections` (
	`order_id` integer NOT NULL,
	`document_no` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`order_id`, `document_no`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `order_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`document_no` text NOT NULL,
	`document_type` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_documents_document_no_unique` ON `order_documents` (`document_no`);--> statement-breakpoint
CREATE INDEX `order_documents_order_idx` ON `order_documents` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`item_id` integer,
	`item_no` text,
	`supplier_id` integer,
	`name` text NOT NULL,
	`unit_of_measure` text,
	`unit_price` real,
	`source` text,
	`quantity` real NOT NULL,
	`sent_quantity` real DEFAULT 0 NOT NULL,
	`cart_error` text,
	`received_quantity` real DEFAULT 0 NOT NULL,
	`resolution` text,
	`substitute_item_no` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `assortment_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_lines_order_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_lines_order_item_idx` ON `order_lines` (`order_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `order_lines_item_idx` ON `order_lines` (`item_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplier_order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`item_no` text NOT NULL,
	`description` text,
	`quantity` real,
	`unit_price` real,
	`discount_percent` real,
	`amount` real,
	FOREIGN KEY (`order_no`) REFERENCES `supplier_orders`(`order_no`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplier_order_lines_order_idx` ON `supplier_order_lines` (`order_no`);--> statement-breakpoint
CREATE INDEX `supplier_order_lines_item_idx` ON `supplier_order_lines` (`item_no`);--> statement-breakpoint
CREATE TABLE `supplier_orders` (
	`order_no` text PRIMARY KEY NOT NULL,
	`order_date` integer,
	`amount` real,
	`amount_including_vat` real,
	`your_reference` text,
	`requested_delivery_date` integer,
	`promised_delivery_date` integer,
	`left_open_list_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
-- Amounts on the list at the time of migrating become the first draft.
INSERT INTO `orders` (`status`)
SELECT 'draft' WHERE EXISTS (
	SELECT 1 FROM `assortment_items`
	WHERE `kind` = 'product' AND `archived_at` IS NULL AND `quantity_to_buy` > 0
);
--> statement-breakpoint
INSERT INTO `order_lines` (`order_id`, `item_id`, `item_no`, `supplier_id`, `name`, `unit_of_measure`, `unit_price`, `quantity`)
SELECT (SELECT max(`id`) FROM `orders`), i.`id`, p.`item_no`, p.`supplier_id`, i.`name`, p.`unit_of_measure`, p.`unit_price`, i.`quantity_to_buy`
FROM `assortment_items` i
LEFT JOIN `supplier_products` p ON p.`id` = i.`supplier_product_id`
WHERE i.`kind` = 'product' AND i.`archived_at` IS NULL AND i.`quantity_to_buy` > 0;
