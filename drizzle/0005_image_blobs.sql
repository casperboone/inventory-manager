CREATE TABLE `supplier_product_images` (
	`item_no` text PRIMARY KEY NOT NULL,
	`thumb` blob NOT NULL,
	`full` blob,
	`full_content_type` text,
	`fetched_at` integer NOT NULL
);
