import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  supplierImports,
  supplierPriceChanges,
  supplierProducts,
} from "@/db/schema";

export const PAGE_SIZE = 50;

export const SORTS = {
  description: supplierProducts.description,
  itemNo: supplierProducts.itemNo,
  price: supplierProducts.unitPrice,
  unit: supplierProducts.unitOfMeasure,
} as const;

export type ProductSort = keyof typeof SORTS;
export type ProductStatus = "active" | "removed" | "all";

export type ProductFilters = {
  q?: string;
  unit?: string;
  status?: ProductStatus;
  assortment?: boolean;
  // Only products first seen in this import.
  newInImportId?: number;
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

export async function searchProducts(filters: ProductFilters) {
  const status = filters.status ?? "active";
  const conditions = [
    filters.q ? searchCondition(filters.q) : undefined,
    filters.unit ? eq(supplierProducts.unitOfMeasure, filters.unit) : undefined,
    status === "active" ? isNull(supplierProducts.removedAt) : undefined,
    status === "removed" ? isNotNull(supplierProducts.removedAt) : undefined,
    filters.assortment ? eq(supplierProducts.inSupplierAssortment, true) : undefined,
    filters.newInImportId
      ? eq(supplierProducts.firstImportId, filters.newInImportId)
      : undefined,
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

export async function getLatestSuccessfulImport() {
  return db.query.supplierImports.findFirst({
    where: eq(supplierImports.status, "succeeded"),
    orderBy: desc(supplierImports.id),
  });
}

export async function isImportRunning() {
  const running = await db.query.supplierImports.findFirst({
    where: eq(supplierImports.status, "running"),
    columns: { id: true },
  });
  return !!running;
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
