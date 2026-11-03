"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItems,
  orderLines,
  orders,
} from "@/db/schema";
import { getItemDialogData } from "@/lib/items/queries";
import { revalidateItemScreens } from "@/lib/items/revalidate";
import { nextCategoryPosition, nextItemPosition } from "@/lib/positions";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

// Per item, so a screen that opens the dialog doesn't need all of pricing to do
// so. Leave out the id for what a new item needs.
export async function loadItemDialog(itemId?: number) {
  try {
    const data = await getItemDialogData(itemId);
    if (itemId != null && !data.item) {
      return { ok: false as const, error: "Item not found." };
    }
    return { ok: true as const, data };
  } catch (error) {
    return failure(error, "Could not load the item.");
  }
}

const optionalNumber = z.number().min(0).nullable();
const fraction = z.number().min(0).max(1).nullable();

const itemSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "A name is required."),
  categoryId: z.number().int().positive().optional(),
  newCategoryName: z.string().trim().min(1).optional(),
  target: optionalNumber,
  supplierProductId: z.number().int().positive().nullable(),
  note: z.string().trim().max(500).nullable(),
  pricingCategoryId: z.number().int().positive().nullable(),
  notForSale: z.boolean(),
  unitVolume: optionalNumber,
  portionVolume: optionalNumber,
  portionsPerUnit: optionalNumber,
  alcoholPercentage: fraction,
  vatRate: fraction,
  manualPurchasePrice: optionalNumber,
  purchaseSource: z.string().trim().max(200).nullable(),
});

export type ItemInput = z.input<typeof itemSchema>;

export async function saveItem(input: ItemInput) {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  const { id, newCategoryName, ...fields } = parsed.data;
  const values = {
    ...fields,
    // Zero portions would only ever divide by zero.
    unitVolume: fields.unitVolume || null,
    portionVolume: fields.portionVolume || null,
    portionsPerUnit: fields.portionsPerUnit || null,
    purchaseSource: fields.purchaseSource || null,
  };

  try {
    let categoryId = fields.categoryId;
    if (newCategoryName) {
      const existing = await db.query.assortmentCategories.findFirst({
        where: eq(assortmentCategories.name, newCategoryName),
        columns: { id: true },
      });
      if (existing) {
        categoryId = existing.id;
      } else {
        const [created] = await db
          .insert(assortmentCategories)
          .values({
            name: newCategoryName,
            position: await nextCategoryPosition(assortmentCategories),
          })
          .returning({ id: assortmentCategories.id });
        categoryId = created.id;
      }
    }
    if (!categoryId) {
      return { ok: false as const, error: "Choose a category." };
    }

    if (id) {
      await db
        .update(assortmentItems)
        .set({ ...values, categoryId, updatedAt: new Date() })
        .where(eq(assortmentItems.id, id));
    } else {
      await db.insert(assortmentItems).values({
        ...values,
        categoryId,
        position: await nextItemPosition(categoryId),
      });
    }

    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the item.");
  }
}

// What's still being put together shouldn't include an item that's going away.
// What was sent is history, and keeps its own copy of the item's details.
function removeFromDrafts(itemId: number) {
  return db.delete(orderLines).where(
    and(
      eq(orderLines.itemId, itemId),
      inArray(
        orderLines.orderId,
        db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.status, "draft"))
      )
    )
  );
}

export async function setItemArchived(itemId: number, archived: boolean) {
  try {
    const update = db
      .update(assortmentItems)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(assortmentItems.id, itemId));
    if (archived) await db.batch([removeFromDrafts(itemId), update]);
    else await update;
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not archive the item.");
  }
}

export async function deleteItem(itemId: number) {
  try {
    await db.batch([
      removeFromDrafts(itemId),
      db
        .update(orderLines)
        .set({ itemId: null })
        .where(eq(orderLines.itemId, itemId)),
      db.delete(assortmentItems).where(eq(assortmentItems.id, itemId)),
    ]);
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the item.");
  }
}
