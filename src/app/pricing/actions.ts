"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  assortmentItems,
  pricingCategories,
  pricingSettings,
  salePriceChanges,
} from "@/db/schema";
import { nextCategoryPosition } from "@/lib/positions";
import { getPricingItem } from "@/lib/pricing/queries";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

function revalidate() {
  revalidatePath("/pricing");
  revalidatePath("/pricing/categories");
}

// Saving a price also records what a portion costs right now, which is what
// "cost changed" on the pricing page compares against. Saving the same price
// again is how you accept a new cost without changing the price.
export async function setSalePrice(itemId: number, price: number | null) {
  if (price != null && (!Number.isFinite(price) || price < 0)) {
    return { ok: false as const, error: "Invalid price." };
  }
  try {
    const row = (await getPricingItem(itemId))?.row;
    if (!row || row.archivedAt) {
      return { ok: false as const, error: "Item not found." };
    }

    const rounded = price == null ? null : Math.round(price * 100) / 100;
    const changed = rounded !== row.salePrice;
    await db
      .update(assortmentItems)
      .set({
        salePrice: rounded,
        salePriceCost: rounded == null ? null : row.cost,
        updatedAt: new Date(),
      })
      .where(eq(assortmentItems.id, itemId));
    if (changed) {
      await db.insert(salePriceChanges).values({
        itemId,
        oldPrice: row.salePrice,
        newPrice: rounded,
        cost: row.cost,
      });
    }
    revalidate();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the price.");
  }
}

const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "A name is required."),
  baseMargin: z.number().min(0).lt(1, "A margin must be below 100%."),
  pivotPrice: z.number().min(0),
  premiumMargin: z.number().min(0).lt(1, "A margin must be below 100%."),
  wastage: z.number().min(0).lt(1, "Wastage must be below 100%."),
  vatRate: z.number().min(0).max(1),
  notes: z.string().trim().max(1000).nullable(),
});

export type PricingCategoryFormInput = z.input<typeof categorySchema>;

export async function savePricingCategory(input: PricingCategoryFormInput) {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  const { id, ...values } = parsed.data;
  try {
    if (id) {
      await db
        .update(pricingCategories)
        .set({ ...values, notes: values.notes || null })
        .where(eq(pricingCategories.id, id));
    } else {
      await db.insert(pricingCategories).values({
        ...values,
        notes: values.notes || null,
        position: await nextCategoryPosition(pricingCategories),
      });
    }
    revalidate();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the category.");
  }
}

export async function deletePricingCategory(id: number) {
  try {
    const used = await db.query.assortmentItems.findFirst({
      where: eq(assortmentItems.pricingCategoryId, id),
      columns: { id: true },
    });
    if (used) {
      return {
        ok: false as const,
        error: "Items still use this category; move them first.",
      };
    }
    await db.delete(pricingCategories).where(eq(pricingCategories.id, id));
    revalidate();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the category.");
  }
}

const settingsSchema = z.object({
  priceRounding: z.number().min(0).max(5),
  adviceTolerance: z.number().min(0).max(1),
  alcoholReferenceItemId: z.number().int().positive().nullable(),
});

export async function savePricingSettings(
  input: z.input<typeof settingsSchema>,
) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  try {
    await db
      .insert(pricingSettings)
      .values({ id: 1, ...parsed.data })
      .onConflictDoUpdate({ target: pricingSettings.id, set: parsed.data });
    revalidate();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the settings.");
  }
}
