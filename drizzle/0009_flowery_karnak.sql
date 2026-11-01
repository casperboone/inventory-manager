CREATE TABLE `supplier_open_entries` (
	`document_no` text PRIMARY KEY NOT NULL,
	`document_type` text DEFAULT 'invoice' NOT NULL,
	`document_date` integer,
	`description` text,
	`order_no` text,
	`amount` real,
	`remaining_amount` real,
	`due_date` integer,
	`payment_discount_date` integer,
	`refreshed_at` integer DEFAULT (unixepoch()) NOT NULL
);
