"use server";

import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assortmentCategories, assortmentItems } from "@/db/schema";
import { getItemDialogData } from "@/lib/items/queries";
import { revalidateItemScreens } from "@/lib/items/revalidate";

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
        const [{ value }] = await db
          .select({ value: max(assortmentCategories.position) })
          .from(assortmentCategories);
        const [created] = await db
          .insert(assortmentCategories)
          .values({ name: newCategoryName, position: (value ?? -1) + 1 })
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
      const [{ value }] = await db
        .select({ value: max(assortmentItems.position) })
        .from(assortmentItems)
        .where(eq(assortmentItems.categoryId, categoryId));
      await db.insert(assortmentItems).values({
        ...values,
        categoryId,
        position: (value ?? -1) + 1,
      });
    }

    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the item.");
  }
}

export async function setItemArchived(itemId: number, archived: boolean) {
  try {
    await db
      .update(assortmentItems)
      .set({
        archivedAt: archived ? new Date() : null,
        // An archived item shouldn't linger on the order list.
        ...(archived ? { quantityToBuy: 0 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(assortmentItems.id, itemId));
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not archive the item.");
  }
}

export async function deleteItem(itemId: number) {
  try {
    await db.delete(assortmentItems).where(eq(assortmentItems.id, itemId));
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the item.");
  }
}
