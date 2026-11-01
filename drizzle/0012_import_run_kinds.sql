ALTER TABLE `supplier_imports` ADD `kind` text DEFAULT 'catalog' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD `invoices_count` integer;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD `credit_memos_count` integer;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD `lines_count` integer;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD `remaining_count` integer;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD `open_orders_count` integer;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD `open_entries_count` integer;