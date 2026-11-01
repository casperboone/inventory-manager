import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const supplierImports = sqliteTable("supplier_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status", { enum: ["running", "succeeded", "failed"] })
    .notNull()
    .default("running"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  error: text("error"),
  // Number of products the supplier reported vs. what we actually received.
  reportedCount: integer("reported_count"),
  fetchedCount: integer("fetched_count"),
  newCount: integer("new_count"),
  updatedCount: integer("updated_count"),
  priceChangedCount: integer("price_changed_count"),
  removedCount: integer("removed_count"),
});

export const supplierProducts = sqliteTable(
  "supplier_products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Item number ("No") in the supplier's webshop. This is our stable key.
    itemNo: text("item_no").notNull().unique(),
    // Internal id in the supplier's webshop, used by e.g. its assortment actions.
    supplierId: integer("supplier_id"),
    description: text("description").notNull(),
    description2: text("description2"),
    unitOfMeasure: text("unit_of_measure"),
    qtyPerUnitOfMeasure: real("qty_per_unit_of_measure"),
    integerOnly: integer("integer_only", { mode: "boolean" })
      .notNull()
      .default(false),
    unitPrice: real("unit_price"),
    gtin: text("gtin"),
    // Whether the product is in our assortment list in the supplier's webshop.
    inSupplierAssortment: integer("in_supplier_assortment", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    // Filled in when the image is fetched from the supplier.
    imageStatus: text("image_status", { enum: ["available", "none"] }),
    imageCheckedAt: integer("image_checked_at", { mode: "timestamp" }),
    // Supplier row as received (HTML fields stripped), for fields we don't map yet.
    raw: text("raw", { mode: "json" }).$type<Record<string, unknown>>(),
    firstImportId: integer("first_import_id").references(
      () => supplierImports.id
    ),
    lastSeenImportId: integer("last_seen_import_id").references(
      () => supplierImports.id
    ),
    // Set when a complete import no longer contains this product.
    removedAt: integer("removed_at", { mode: "timestamp" }),
    removedInImportId: integer("removed_in_import_id").references(
      () => supplierImports.id
    ),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("supplier_products_first_import_idx").on(t.firstImportId),
    index("supplier_products_description_idx").on(t.description),
  ]
);

export const supplierPriceChanges = sqliteTable(
  "supplier_price_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => supplierProducts.id),
    importId: integer("import_id")
      .notNull()
      .references(() => supplierImports.id),
    oldPrice: real("old_price"),
    newPrice: real("new_price"),
    createdAt: createdAt(),
  },
  (t) => [
    index("supplier_price_changes_import_idx").on(t.importId),
    index("supplier_price_changes_product_idx").on(t.productId),
  ]
);

export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type SupplierImport = typeof supplierImports.$inferSelect;

// Posted invoices, imported for their line discounts ("regelkorting"), which
// the supplier exposes nowhere else: not in the catalog, not in the cart.
export const supplierInvoices = sqliteTable("supplier_invoices", {
  documentNo: text("document_no").primaryKey(),
  // Posted invoices and still-open orders both carry line discounts; an open
  // order knows them right after ordering, weeks before its invoice.
  documentType: text("document_type", {
    enum: ["invoice", "creditmemo", "order"],
  })
    .notNull()
    .default("invoice"),
  documentDate: integer("document_date", { mode: "timestamp" }),
  amount: real("amount"),
  // What it comes to with VAT; the supplier lists both.
  amountIncludingVat: real("amount_including_vat"),
  lineCount: integer("line_count").notNull().default(0),
  // The order an invoice came from. Only known while the invoice is still
  // unpaid, because the outstanding list is the one place that names it.
  orderNo: text("order_no"),
  // Fields the supplier carries but leaves empty for us; kept because they
  // cost nothing and would otherwise need another import to fill in.
  yourReference: text("your_reference"),
  salespersonCode: text("salesperson_code"),
  // Orders only.
  requestedDeliveryDate: integer("requested_delivery_date", {
    mode: "timestamp",
  }),
  promisedDeliveryDate: integer("promised_delivery_date", {
    mode: "timestamp",
  }),
  importedAt: createdAt(),
});

export const supplierInvoiceLines = sqliteTable(
  "supplier_invoice_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentNo: text("document_no")
      .notNull()
      .references(() => supplierInvoices.documentNo, { onDelete: "cascade" }),
    documentType: text("document_type", {
      enum: ["invoice", "creditmemo", "order"],
    })
      .notNull()
      .default("invoice"),
    documentDate: integer("document_date", { mode: "timestamp" }),
    itemNo: text("item_no").notNull(),
    description: text("description"),
    quantity: real("quantity"),
    unitPrice: real("unit_price"),
    // The line discount as invoiced; varies a little per invoice because it
    // is a fixed amount against a changing price.
    discountPercent: real("discount_percent"),
    amount: real("amount"),
  },
  (t) => [
    index("supplier_invoice_lines_item_idx").on(t.itemNo, t.documentDate),
    index("supplier_invoice_lines_document_idx").on(t.documentNo),
  ]
);

// What is still unpaid, straight from the supplier's bookkeeping. Refreshed
// as a whole on every document import: entries disappear once they are paid,
// so there is nothing to keep.
export const supplierOpenEntries = sqliteTable("supplier_open_entries", {
  documentNo: text("document_no").primaryKey(),
  documentType: text("document_type", { enum: ["invoice", "creditmemo"] })
    .notNull()
    .default("invoice"),
  documentDate: integer("document_date", { mode: "timestamp" }),
  description: text("description"),
  // The order the invoice came from, parsed out of the description. This is
  // the only place the supplier links the two.
  orderNo: text("order_no"),
  // Amounts here include VAT, unlike the document lists.
  amount: real("amount"),
  remainingAmount: real("remaining_amount"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  // Last day the payment discount ("contantkorting") applies.
  paymentDiscountDate: integer("payment_discount_date", { mode: "timestamp" }),
  refreshedAt: integer("refreshed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SupplierOpenEntry = typeof supplierOpenEntries.$inferSelect;

export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type SupplierInvoiceLine = typeof supplierInvoiceLines.$inferSelect;

// Cached supplier product images. They live in the database rather than on
// disk so they survive on hosting without a persistent filesystem.
export const supplierProductImages = sqliteTable("supplier_product_images", {
  itemNo: text("item_no").primaryKey(),
  // Small webp used in listings.
  thumb: blob("thumb", { mode: "buffer" }).notNull().$type<Buffer>(),
  // The image as the supplier serves it, for the larger preview.
  full: blob("full", { mode: "buffer" }).$type<Buffer>(),
  fullContentType: text("full_content_type"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

// How a group of items is priced: the base margin applies up to the pivot
// price, and the part of the cost above that gets the (lower) premium margin.
export const pricingCategories = sqliteTable("pricing_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
  baseMargin: real("base_margin").notNull(),
  pivotPrice: real("pivot_price").notNull(),
  premiumMargin: real("premium_margin").notNull(),
  // Share of a purchase unit that never gets sold (tap loss, spills).
  wastage: real("wastage").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(0.21),
  // Why the numbers are what they are.
  notes: text("notes"),
  createdAt: createdAt(),
});

// One row (id 1) with the settings that apply to all pricing.
export const pricingSettings = sqliteTable("pricing_settings", {
  id: integer("id").primaryKey(),
  // Advice prices are rounded to a multiple of this.
  priceRounding: real("price_rounding").notNull().default(0.1),
  // How far a sale price may sit from the advice before it is flagged.
  adviceTolerance: real("advice_tolerance").notNull().default(0.1),
  // Drinks whose price per 10 ml of alcohol is below this item's get
  // flagged, so nothing is a cheaper way to get drunk than the house beer.
  alcoholReferenceItemId: integer("alcohol_reference_item_id"),
});

// Our own assortment: what we sell at the bar, grouped into categories that
// double as headings on the order page.
export const assortmentCategories = sqliteTable("assortment_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export const assortmentItems = sqliteTable(
  "assortment_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => assortmentCategories.id),
    // A "note" is a free text line between products, for jotting things down
    // while walking around the stock. Only its name is used.
    kind: text("kind", { enum: ["product", "note"] })
      .notNull()
      .default("product"),
    // Our own name for the product, e.g. "Coca-Cola Zero".
    name: text("name").notNull(),
    // Not every item is linked to a supplier product (yet).
    supplierProductId: integer("supplier_product_id").references(
      () => supplierProducts.id
    ),
    // Desired amount in stock, in the supplier's sales unit. Can be a half.
    target: real("target"),
    // Amount to order on the next run; the order page edits this directly.
    quantityToBuy: real("quantity_to_buy").notNull().default(0),
    position: integer("position").notNull().default(0),
    note: text("note"),
    // Pricing, edited on the pricing page only. The calculation lives in
    // src/lib/pricing/calc.ts.
    pricingCategoryId: integer("pricing_category_id").references(
      () => pricingCategories.id
    ),
    // Things we buy but don't sell, like toilet paper or sugar sticks.
    notForSale: integer("not_for_sale", { mode: "boolean" })
      .notNull()
      .default(false),
    // Liters in one purchase unit (a crate of 24/20cl holds 4.8) and in one
    // portion; together they give the number of portions.
    unitVolume: real("unit_volume"),
    portionVolume: real("portion_volume"),
    // For what isn't poured (crisps, capsules), or to override the above.
    portionsPerUnit: real("portions_per_unit"),
    // As a fraction (0.05 for 5%), like the margins.
    alcoholPercentage: real("alcohol_percentage"),
    // Overrides the pricing category's VAT rate.
    vatRate: real("vat_rate"),
    // Per purchase unit, excluding VAT. Overrides the supplier's catalog
    // price, and is the only price for what we buy elsewhere.
    manualPurchasePrice: real("manual_purchase_price"),
    // Where an item comes from when it isn't Rust Food.
    purchaseSource: text("purchase_source"),
    // What we charge per portion, including VAT.
    salePrice: real("sale_price"),
    // The cost per portion when the sale price was last set, so the pricing
    // page can tell when the purchase price moved since.
    salePriceCost: real("sale_price_cost"),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("assortment_items_category_idx").on(t.categoryId, t.position),
    index("assortment_items_supplier_idx").on(t.supplierProductId),
  ]
);

// Our own image for an assortment item, used when the supplier has none.
// Picked from an image search and stored here, so nothing depends on the
// original URL staying alive.
export const assortmentItemImages = sqliteTable("assortment_item_images", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => assortmentItems.id, { onDelete: "cascade" }),
  thumb: blob("thumb", { mode: "buffer" }).notNull().$type<Buffer>(),
  full: blob("full", { mode: "buffer" }).notNull().$type<Buffer>(),
  // Where it came from, so we can tell later where an image was found.
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  createdAt: createdAt(),
});

// Every change to a sale price, for looking back at what we charged when.
export const salePriceChanges = sqliteTable(
  "sale_price_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => assortmentItems.id, { onDelete: "cascade" }),
    oldPrice: real("old_price"),
    newPrice: real("new_price"),
    // Cost per portion at the time, to see the margin it was set at.
    cost: real("cost"),
    createdAt: createdAt(),
  },
  (t) => [index("sale_price_changes_item_idx").on(t.itemId, t.createdAt)]
);

export type PricingCategory = typeof pricingCategories.$inferSelect;
export type PricingSettings = typeof pricingSettings.$inferSelect;
export type SalePriceChange = typeof salePriceChanges.$inferSelect;
export type AssortmentCategory = typeof assortmentCategories.$inferSelect;
export type AssortmentItem = typeof assortmentItems.$inferSelect;
