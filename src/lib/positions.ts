import { eq, max } from "drizzle-orm";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItems,
  pricingCategories,
} from "@/db/schema";

// New rows go at the end of their list; an empty list starts at zero.
export function positionAfter(last: number | null) {
  return (last ?? -1) + 1;
}

export async function nextItemPosition(categoryId: number) {
  const [{ value }] = await db
    .select({ value: max(assortmentItems.position) })
    .from(assortmentItems)
    .where(eq(assortmentItems.categoryId, categoryId));
  return positionAfter(value);
}

// Order categories and pricing categories are separate lists.
export async function nextCategoryPosition(
  table: typeof assortmentCategories | typeof pricingCategories,
) {
  const [{ value }] = await db
    .select({ value: max(table.position) })
    .from(table);
  return positionAfter(value);
}
