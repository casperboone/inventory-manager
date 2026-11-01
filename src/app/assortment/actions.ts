"use server";

import { revalidatePath } from "next/cache";
import { eq, gt, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { db } from "@/db";
import { assortmentCategories, assortmentItems } from "@/db/schema";
import {
  getOrderReview,
  searchCatalogForPicker,
  type PickerProduct,
} from "@/lib/assortment/queries";
import {
  addManyToSupplierCart,
  addToSupplierCart,
} from "@/lib/supplier/cart-service";
import { logger } from "@/lib/logger";
import { deleteItemImage, saveItemImageFromUrl } from "@/lib/images/store";
import {
  searchProductImages,
  type ImageCandidate,
} from "@/lib/images/search";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

// The order page edits this on every tap, so it stays deliberately small.
export async function setQuantityToBuy(itemId: number, quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, error: "Invalid quantity." };
  }
  try {
    await db
      .update(assortmentItems)
      .set({ quantityToBuy: quantity, updatedAt: new Date() })
      .where(eq(assortmentItems.id, itemId));
    // No revalidate: the page owns this value while you are tapping.
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the amount.");
  }
}

export async function clearOrderList() {
  try {
    await db
      .update(assortmentItems)
      .set({ quantityToBuy: 0, updatedAt: new Date() })
      .where(gt(assortmentItems.quantityToBuy, 0));
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not clear the list.");
  }
}

const itemSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "A name is required."),
  categoryId: z.number().int().positive().optional(),
  newCategoryName: z.string().trim().min(1).optional(),
  target: z.number().min(0).nullable(),
  supplierProductId: z.number().int().positive().nullable(),
  note: z.string().trim().max(500).nullable(),
});

export type ItemInput = z.input<typeof itemSchema>;

export async function saveAssortmentItem(input: ItemInput) {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  const { id, name, target, supplierProductId, note, newCategoryName } =
    parsed.data;

  try {
    let categoryId = parsed.data.categoryId;
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
        .set({
          name,
          categoryId,
          target,
          supplierProductId,
          note,
          updatedAt: new Date(),
        })
        .where(eq(assortmentItems.id, id));
    } else {
      const [{ value }] = await db
        .select({ value: max(assortmentItems.position) })
        .from(assortmentItems)
        .where(eq(assortmentItems.categoryId, categoryId));
      await db.insert(assortmentItems).values({
        name,
        categoryId,
        target,
        supplierProductId,
        note,
        position: (value ?? -1) + 1,
      });
    }

    revalidatePath("/assortment");
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
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not archive the item.");
  }
}

export async function deleteAssortmentItem(itemId: number) {
  try {
    await db.delete(assortmentItems).where(eq(assortmentItems.id, itemId));
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the item.");
  }
}

export async function searchCatalog(
  query: string
): Promise<{ ok: true; data: PickerProduct[] } | { ok: false; error: string }> {
  try {
    const data = await searchCatalogForPicker(query);
    return { ok: true, data };
  } catch (error) {
    return failure(error, "Search failed.");
  }
}

// Used by the "unused categories" cleanup when the last item moves away.
export async function deleteEmptyCategory(categoryId: number) {
  try {
    const remaining = await db.query.assortmentItems.findFirst({
      where: eq(assortmentItems.categoryId, categoryId),
      columns: { id: true },
    });
    if (remaining) {
      return { ok: false as const, error: "Category still has items." };
    }
    await db
      .delete(assortmentCategories)
      .where(eq(assortmentCategories.id, categoryId));
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the category.");
  }
}

// Quick note lines: created empty and typed straight into the list.
export async function createNote(categoryId: number, text = "") {
  try {
    const [{ value }] = await db
      .select({ value: max(assortmentItems.position) })
      .from(assortmentItems)
      .where(eq(assortmentItems.categoryId, categoryId));
    const [created] = await db
      .insert(assortmentItems)
      .values({
        categoryId,
        kind: "note",
        name: text,
        position: (value ?? -1) + 1,
      })
      .returning({ id: assortmentItems.id });
    revalidatePath("/assortment");
    return { ok: true as const, id: created.id };
  } catch (error) {
    return failure(error, "Could not add the note.");
  }
}

export async function updateNote(itemId: number, text: string) {
  try {
    await db
      .update(assortmentItems)
      .set({ name: text.slice(0, 500), updatedAt: new Date() })
      .where(eq(assortmentItems.id, itemId));
    // No revalidate: the list owns this text while you are typing.
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the note.");
  }
}

// Reordering writes the new positions for one category in a single batch.
export async function reorderItems(orderedIds: number[]) {
  try {
    if (orderedIds.length === 0) return { ok: true as const };
    const statements: BatchItem<"sqlite">[] = orderedIds.map((id, position) =>
      db
        .update(assortmentItems)
        .set({ position })
        .where(eq(assortmentItems.id, id))
    );
    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the new order.");
  }
}

export async function reorderCategories(orderedIds: number[]) {
  try {
    if (orderedIds.length === 0) return { ok: true as const };
    const statements: BatchItem<"sqlite">[] = orderedIds.map((id, position) =>
      db
        .update(assortmentCategories)
        .set({ position })
        .where(eq(assortmentCategories.id, id))
    );
    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the new order.");
  }
}

export type CartSubmitResult = {
  ok: true;
  added: { name: string; itemNo: string; quantity: number }[];
  failed: { name: string; itemNo: string; quantity: number; error: string }[];
  notesCleared: number;
  amountsReset: number;
  // The supplier's own cart totals after the last successful add.
  cart?: { totalItems?: number; totalQuantity?: number; totalPrice?: string };
};

// Sends the reviewed order lines to the supplier's cart in one call. The
// caller passes exactly what was on screen; if the list has changed since,
// nothing is sent — ordering should never include something unreviewed.
export async function addOrderToSupplierCart(options: {
  resetAmounts: boolean;
  clearNotes: boolean;
  reviewed: { id: number; quantity: number }[];
}): Promise<CartSubmitResult | { ok: false; error: string }> {
  try {
    const { lines } = await getOrderReview();
    if (lines.length === 0) {
      return { ok: false as const, error: "There is nothing to order." };
    }

    const reviewed = new Map(
      options.reviewed.map((line) => [line.id, line.quantity])
    );
    const changed =
      lines.length !== reviewed.size ||
      lines.some((line) => reviewed.get(line.id) !== line.quantityToBuy);
    if (changed) {
      return {
        ok: false as const,
        error:
          "The list changed while you were reviewing. Reload the page and check the order again.",
      };
    }

    const added: CartSubmitResult["added"] = [];
    const failed: CartSubmitResult["failed"] = [];
    let cart: CartSubmitResult["cart"];

    // One request for the whole order instead of one per product. The
    // supplier refuses the batch as a whole over a single bad line, so
    // whatever does not come back accepted is retried on its own, which also
    // tells us which product was the problem.
    const bulk = lines.filter((line) => line.supplierId != null);
    let accepted = new Set<string>();
    if (bulk.length > 0) {
      try {
        const result = await addManyToSupplierCart(
          bulk.map((line) => ({
            itemNo: line.itemNo!,
            supplierId: line.supplierId!,
            quantity: line.quantityToBuy,
            unitOfMeasure: line.unitOfMeasure,
          }))
        );
        accepted = new Set(result.added);
        if (result.cart.totalItems != null) cart = result.cart;
      } catch (error) {
        logger.warn(
          `Bulk cart add failed, falling back to one call per line: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }

    for (const line of lines) {
      if (accepted.has(line.itemNo!)) {
        added.push({
          name: line.name,
          itemNo: line.itemNo!,
          quantity: line.quantityToBuy,
        });
        continue;
      }
      try {
        cart = await addToSupplierCart(line.itemNo!, line.quantityToBuy);
        added.push({
          name: line.name,
          itemNo: line.itemNo!,
          quantity: line.quantityToBuy,
        });
      } catch (error) {
        failed.push({
          name: line.name,
          itemNo: line.itemNo!,
          quantity: line.quantityToBuy,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Only clear what actually made it into the cart.
    let amountsReset = 0;
    if (options.resetAmounts && added.length > 0) {
      const addedIds = lines
        .filter((line) => added.some((row) => row.itemNo === line.itemNo))
        .map((line) => line.id);
      const statements: BatchItem<"sqlite">[] = addedIds.map((id) =>
        db
          .update(assortmentItems)
          .set({ quantityToBuy: 0, updatedAt: new Date() })
          .where(eq(assortmentItems.id, id))
      );
      if (statements.length > 0) {
        await db.batch(
          statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
        );
        amountsReset = statements.length;
      }
    }

    // Notes are only dropped when the whole order went through.
    let notesCleared = 0;
    if (options.clearNotes && failed.length === 0) {
      const removed = await db
        .delete(assortmentItems)
        .where(eq(assortmentItems.kind, "note"))
        .returning({ id: assortmentItems.id });
      notesCleared = removed.length;
    }

    revalidatePath("/assortment");
    revalidatePath("/assortment/review");
    return {
      ok: true as const,
      added,
      failed,
      notesCleared,
      amountsReset,
      cart,
    };
  } catch (error) {
    return failure(error, "Could not send the order.");
  }
}

// Image search for items the supplier has no picture for.
export async function searchItemImages(
  query: string
): Promise<
  { ok: true; results: ImageCandidate[] } | { ok: false; error: string }
> {
  try {
    return { ok: true as const, results: await searchProductImages(query) };
  } catch (error) {
    return failure(error, "Image search failed.");
  }
}

export async function setItemImage(
  itemId: number,
  imageUrl: string,
  sourceName?: string,
  fallbackUrl?: string
) {
  try {
    await saveItemImageFromUrl(itemId, imageUrl, sourceName, fallbackUrl);
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the image.");
  }
}

export async function removeItemImage(itemId: number) {
  try {
    await deleteItemImage(itemId);
    revalidatePath("/assortment");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not remove the image.");
  }
}
