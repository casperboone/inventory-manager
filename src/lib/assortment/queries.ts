import { asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { DiscountStatus } from "@/lib/products/discount-types";
import {
  assortmentCategories,
  assortmentItemImages,
  assortmentItems,
  supplierProducts,
} from "@/db/schema";

// What the order page needs per item: our own fields plus the supplier details
// used for ordering (unit, price, image).
export type AssortmentRow = {
  id: number;
  kind: "product" | "note";
  name: string;
  target: number | null;
  quantityToBuy: number;
  note: string | null;
  archivedAt: Date | null;
  categoryId: number;
  supplierProductId: number | null;
  itemNo: string | null;
  // The portal's own product id, which its bulk cart endpoint keys on.
  supplierId: number | null;
  supplierDescription: string | null;
  unitOfMeasure: string | null;
  unitPrice: number | null;
  imageStatus: "available" | "none" | null;
  supplierRemoved: boolean;
  // An image of our own, used when the supplier has none.
  hasOwnImage: boolean;
  // Line discount as last invoiced; only set for linked products.
  discount?: DiscountStatus;
};

export type AssortmentCategoryWithItems = {
  id: number;
  name: string;
  items: AssortmentRow[];
};

async function selectItems(archived: boolean) {
  const rows = await db
    .select({
      id: assortmentItems.id,
      kind: assortmentItems.kind,
      name: assortmentItems.name,
      target: assortmentItems.target,
      quantityToBuy: assortmentItems.quantityToBuy,
      note: assortmentItems.note,
      archivedAt: assortmentItems.archivedAt,
      categoryId: assortmentItems.categoryId,
      categoryName: assortmentCategories.name,
      categoryPosition: assortmentCategories.position,
      position: assortmentItems.position,
      supplierProductId: assortmentItems.supplierProductId,
      itemNo: supplierProducts.itemNo,
      supplierId: supplierProducts.supplierId,
      supplierDescription: supplierProducts.description,
      unitOfMeasure: supplierProducts.unitOfMeasure,
      unitPrice: supplierProducts.unitPrice,
      imageStatus: supplierProducts.imageStatus,
      removedAt: supplierProducts.removedAt,
      ownImageId: assortmentItemImages.itemId,
    })
    .from(assortmentItems)
    .innerJoin(
      assortmentCategories,
      eq(assortmentItems.categoryId, assortmentCategories.id)
    )
    .leftJoin(
      supplierProducts,
      eq(assortmentItems.supplierProductId, supplierProducts.id)
    )
    .leftJoin(
      assortmentItemImages,
      eq(assortmentItemImages.itemId, assortmentItems.id)
    )
    .where(
      archived
        ? isNotNull(assortmentItems.archivedAt)
        : isNull(assortmentItems.archivedAt)
    )
    .orderBy(
      asc(assortmentCategories.position),
      asc(assortmentItems.position),
      asc(assortmentItems.id)
    );

  return rows;
}

function groupByCategory(
  rows: Awaited<ReturnType<typeof selectItems>>
): AssortmentCategoryWithItems[] {
  const categories: AssortmentCategoryWithItems[] = [];
  for (const row of rows) {
    let category = categories.find((c) => c.id === row.categoryId);
    if (!category) {
      category = { id: row.categoryId, name: row.categoryName, items: [] };
      categories.push(category);
    }
    category.items.push({
      id: row.id,
      kind: row.kind,
      name: row.name,
      target: row.target,
      quantityToBuy: row.quantityToBuy,
      note: row.note,
      archivedAt: row.archivedAt,
      categoryId: row.categoryId,
      supplierProductId: row.supplierProductId,
      itemNo: row.itemNo,
      supplierId: row.supplierId,
      supplierDescription: row.supplierDescription,
      unitOfMeasure: row.unitOfMeasure,
      unitPrice: row.unitPrice,
      imageStatus: row.imageStatus,
      supplierRemoved: row.removedAt !== null,
      hasOwnImage: row.ownImageId !== null,
    });
  }
  return categories;
}

export async function getAssortment() {
  const categories = groupByCategory(await selectItems(false));
  await attachDiscounts(categories);
  return categories;
}

// The line discount per item, looked up in one go for the whole page.
async function attachDiscounts(categories: AssortmentCategoryWithItems[]) {
  const { getDiscountStatuses } = await import("@/lib/products/discounts");
  const itemNos = categories
    .flatMap((category) => category.items)
    .flatMap((item) => (item.itemNo ? [item.itemNo] : []));
  const statuses = await getDiscountStatuses(itemNos);

  for (const category of categories) {
    for (const item of category.items) {
      item.discount = item.itemNo
        ? (statuses.get(item.itemNo) ?? { kind: "unknown" })
        : undefined;
    }
  }
}

export async function getArchivedAssortment() {
  return groupByCategory(await selectItems(true));
}

export async function getCategories() {
  return db
    .select()
    .from(assortmentCategories)
    .orderBy(asc(assortmentCategories.position), asc(assortmentCategories.id));
}

// Next position in a category, so new items land at the bottom.
export async function nextItemPosition(categoryId: number) {
  const last = await db.query.assortmentItems.findFirst({
    where: eq(assortmentItems.categoryId, categoryId),
    orderBy: (items, { desc }) => desc(items.position),
    columns: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

// Catalog search for linking an item to a supplier product.
export async function searchCatalogForPicker(query: string, limit = 8) {
  const { searchProducts } = await import("@/lib/products/queries");
  const { rows } = await searchProducts({ q: query, status: "active" });
  return rows.slice(0, limit).map((product) => ({
    id: product.id,
    itemNo: product.itemNo,
    description: product.description,
    unitOfMeasure: product.unitOfMeasure,
    unitPrice: product.unitPrice,
    imageStatus: product.imageStatus,
  }));
}

export type PickerProduct = Awaited<
  ReturnType<typeof searchCatalogForPicker>
>[number];

export async function getSupplierProductById(id: number) {
  const product = await db.query.supplierProducts.findFirst({
    where: eq(supplierProducts.id, id),
    columns: {
      id: true,
      itemNo: true,
      description: true,
      unitOfMeasure: true,
      unitPrice: true,
      imageStatus: true,
    },
  });
  return product ?? null;
}

export type OrderReview = {
  // Lines that can be added to the supplier cart automatically.
  lines: (AssortmentRow & { categoryName: string })[];
  // Products with an amount but no usable catalog link: order these by hand.
  manual: (AssortmentRow & { categoryName: string })[];
  // Every note, since notes are always something to handle yourself.
  notes: (AssortmentRow & { categoryName: string })[];
};

export async function getOrderReview(): Promise<OrderReview> {
  const categories = await getAssortment();
  const rows = categories.flatMap((category) =>
    category.items.map((item) => ({ ...item, categoryName: category.name }))
  );

  const withAmount = rows.filter(
    (row) => row.kind === "product" && row.quantityToBuy > 0
  );

  return {
    lines: withAmount.filter((row) => row.itemNo && !row.supplierRemoved),
    manual: withAmount.filter((row) => !row.itemNo || row.supplierRemoved),
    notes: rows.filter((row) => row.kind === "note"),
  };
}
