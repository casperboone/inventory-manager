ALTER TABLE `supplier_invoice_lines` ADD `document_type` text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `document_type` text DEFAULT 'invoice' NOT NULL;