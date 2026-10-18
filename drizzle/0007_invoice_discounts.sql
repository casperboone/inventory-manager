CREATE TABLE `supplier_invoice_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_no` text NOT NULL,
	`document_date` integer,
	`item_no` text NOT NULL,
	`description` text,
	`quantity` real,
	`unit_price` real,
	`discount_percent` real,
	`amount` real,
	FOREIGN KEY (`document_no`) REFERENCES `supplier_invoices`(`document_no`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplier_invoice_lines_item_idx` ON `supplier_invoice_lines` (`item_no`,`document_date`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_lines_document_idx` ON `supplier_invoice_lines` (`document_no`);--> statement-breakpoint
CREATE TABLE `supplier_invoices` (
	`document_no` text PRIMARY KEY NOT NULL,
	`document_date` integer,
	`amount` real,
	`line_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
