ALTER TABLE `supplier_invoices` ADD `amount_including_vat` real;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `order_no` text;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `your_reference` text;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `salesperson_code` text;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `requested_delivery_date` integer;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `promised_delivery_date` integer;