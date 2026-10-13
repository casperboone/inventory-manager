CREATE TABLE `assortment_item_images` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`thumb` blob NOT NULL,
	`full` blob NOT NULL,
	`source_url` text,
	`source_name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `assortment_items`(`id`) ON UPDATE no action ON DELETE cascade
);
