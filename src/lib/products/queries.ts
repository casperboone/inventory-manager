import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  supplierImports,
  supplierInvoices,
  supplierPriceChanges,
  supplierProducts,
  type SupplierImport,
} from "@/db/schema";
import { isRunActive, type ImportKind } from "@/lib/supplier/import-runs";
import { latestDiscountLines } from "./discounts";

export const PAGE_SIZE = 50;

export const SORTS = {
  description: supplierProducts.description,
  itemNo: supplierProducts.itemNo,
  price: supplierProducts.unitPrice,
  unit: supplierProducts.unitOfMeasure,
} as const;

export type ProductSort = keyof typeof SORTS;
export type ProductStatus = "active" | "removed" | "all";
export type DiscountFilter = "yes" | "no" | "unknown";

export type ProductFilters = {
  q?: string;
  unit?: string;
  status?: ProductStatus;
  // Only products first seen in this import.
  newInImportId?: number;
  // Filter on the line discount we last saw on an invoice.
  discount?: DiscountFilter;
  sort?: ProductSort;
  dir?: "asc" | "desc";
  page?: number;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Every whitespace-separated term must match the description, item number or
// GTIN, so "cola zero 33" finds "COCA COLA ZERO BLIK(DK) 24/33CL".
function searchCondition(q: string): SQL | undefined {
  const terms = q.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return undefined;

  return and(
    ...terms.map((term) => {
      const pattern = `%${escapeLike(term)}%`;
      return or(
        sql`${supplierProducts.description} like ${pattern} escape '\\'`,
        sql`coalesce(${supplierProducts.description2}, '') like ${pattern} escape '\\'`,
        like(supplierProducts.itemNo, `${escapeLike(term)}%`),
        eq(supplierProducts.gtin, term)
      );
    })
  );
}

// The discount lives in the invoice history. These match what the badges show:
// no line means unknown, a line at zero or less means no discount.
function discountCondition(filter: DiscountFilter): SQL {
  const latest = latestDiscountLines();
  const itemNo = supplierProducts.itemNo;

  if (filter === "unknown") {
    return sql`${itemNo} not in (select item_no from ${latest})`;
  }
  if (filter === "yes") {
    return sql`${itemNo} in (select item_no from ${latest} where discount_percent > 0)`;
  }
  return sql`${itemNo} in (select item_no from ${latest} where discount_percent <= 0)`;
}

export async function searchProducts(filters: ProductFilters) {
  const status = filters.status ?? "active";
  const conditions = [
    filters.q ? searchCondition(filters.q) : undefined,
    filters.unit ? eq(supplierProducts.unitOfMeasure, filters.unit) : undefined,
    status === "active" ? isNull(supplierProducts.removedAt) : undefined,
    status === "removed" ? isNotNull(supplierProducts.removedAt) : undefined,
    filters.newInImportId
      ? eq(supplierProducts.firstImportId, filters.newInImportId)
      : undefined,
    filters.discount ? discountCondition(filters.discount) : undefined,
  ];
  const where = and(...conditions);

  const sortColumn = SORTS[filters.sort ?? "description"];
  const order = filters.dir === "desc" ? desc : asc;
  const page = Math.max(1, filters.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(supplierProducts)
      .where(where)
      .orderBy(order(sortColumn), asc(supplierProducts.itemNo))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(supplierProducts).where(where),
  ]);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getUnitsOfMeasure() {
  const rows = await db
    .selectDistinct({ unit: supplierProducts.unitOfMeasure })
    .from(supplierProducts)
    .where(isNotNull(supplierProducts.unitOfMeasure))
    .orderBy(asc(supplierProducts.unitOfMeasure));
  return rows.flatMap((r) => (r.unit ? [r.unit] : []));
}

export type SyncStatus = {
  kind: ImportKind;
  // Whether a run is in progress right now. A run that crashed never says so,
  // which is why this is not just its status.
  running: boolean;
  latest: SupplierImport | undefined;
  lastSuccess: SupplierImport | undefined;
};

export async function getSyncStatus(kind: ImportKind): Promise<SyncStatus> {
  const [latest, lastSuccess] = await Promise.all([
    db.query.supplierImports.findFirst({
      where: eq(supplierImports.kind, kind),
      orderBy: desc(supplierImports.id),
    }),
    db.query.supplierImports.findFirst({
      where: and(
        eq(supplierImports.kind, kind),
        eq(supplierImports.status, "succeeded")
      ),
      orderBy: desc(supplierImports.id),
    }),
  ]);
  return {
    kind,
    running: latest ? isRunActive(latest) : false,
    latest,
    lastSuccess,
  };
}

export async function getImports(limit = 50) {
  return db
    .select()
    .from(supplierImports)
    .orderBy(desc(supplierImports.id))
    .limit(limit);
}

export async function getImport(id: number) {
  return db.query.supplierImports.findFirst({
    where: eq(supplierImports.id, id),
  });
}

// The invoices and credit notes a document run read. The run's window is enough
// to find them, since only one document run goes at a time.
export async function getImportDocuments(run: SupplierImport) {
  return db
    .select()
    .from(supplierInvoices)
    .where(
      and(
        inArray(supplierInvoices.documentType, ["invoice", "creditmemo"]),
        gte(supplierInvoices.importedAt, run.startedAt),
        run.finishedAt
          ? lte(supplierInvoices.importedAt, run.finishedAt)
          : undefined
      )
    )
    .orderBy(
      desc(supplierInvoices.documentDate),
      desc(supplierInvoices.documentNo)
    );
}

// What the catalog price of one product did over time, newest first.
export async function getProductPriceChanges(productId: number) {
  return db
    .select()
    .from(supplierPriceChanges)
    .where(eq(supplierPriceChanges.productId, productId))
    .orderBy(desc(supplierPriceChanges.id));
}

export async function getImportChanges(importId: number) {
  const [newProducts, priceChanges, removed] = await Promise.all([
    db
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.firstImportId, importId))
      .orderBy(asc(supplierProducts.description)),
    db
      .select({
        product: supplierProducts,
        oldPrice: supplierPriceChanges.oldPrice,
        newPrice: supplierPriceChanges.newPrice,
      })
      .from(supplierPriceChanges)
      .innerJoin(
        supplierProducts,
        eq(supplierPriceChanges.productId, supplierProducts.id)
      )
      .where(eq(supplierPriceChanges.importId, importId))
      .orderBy(asc(supplierProducts.description)),
    db
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.removedInImportId, importId))
      .orderBy(asc(supplierProducts.description)),
  ]);

  return { newProducts, priceChanges, removed };
}
