"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItems,
  orderLines,
  orders,
  supplierProducts,
} from "@/db/schema";
import { formatNumber } from "@/lib/format";
import {
  searchCatalogForPicker,
  type PickerProduct,
} from "@/lib/assortment/queries";
import {
  addManyToSupplierCart,
  addToSupplierCart,
} from "@/lib/supplier/cart-service";
import { revalidateItemScreens } from "@/lib/items/revalidate";
import { logger } from "@/lib/logger";
import { deleteItemImage, saveItemImageFromUrl } from "@/lib/images/store";
import {
  getOrderReview,
  rememberCurrentOrder,
  resolveDraft,
} from "@/lib/orders/drafts";
import { orderReference } from "@/lib/orders/reference";
import { nextItemPosition } from "@/lib/positions";
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

function revalidateOrderScreens() {
  revalidatePath("/order-list");
  revalidatePath("/order-list/review");
  revalidatePath("/orders");
  revalidatePath("/orders/[id]", "page");
}

// The order page edits this on every tap, so it stays deliberately small: with
// a draft in hand it's one statement. Without one, this tap starts it.
export async function setLineQuantity(
  itemId: number,
  quantity: number,
  orderId: number | null
) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, error: "Invalid quantity." };
  }
  try {
    const draftId = await resolveDraft(orderId);
    if (quantity === 0) {
      await db
        .delete(orderLines)
        .where(
          and(eq(orderLines.orderId, draftId), eq(orderLines.itemId, itemId))
        );
    } else {
      await db.run(sql`
        insert into order_lines
          (order_id, item_id, item_no, supplier_id, name, unit_of_measure, unit_price, quantity)
        select ${draftId}, i.id, p.item_no, p.supplier_id, i.name, p.unit_of_measure, p.unit_price, ${quantity}
        from assortment_items i
        left join supplier_products p on p.id = i.supplier_product_id
        where i.id = ${itemId} and i.kind = 'product'
        on conflict (order_id, item_id) do update set quantity = excluded.quantity
      `);
    }
    // No revalidate: the page owns this value while you are tapping.
    return { ok: true as const, orderId: draftId };
  } catch (error) {
    return failure(error, "Could not save the amount.");
  }
}

const oneOffSchema = z
  .object({
    orderId: z.number().int().positive().nullable(),
    // From the catalog: it goes to the cart and gets matched like anything else.
    productId: z.number().int().positive().nullable(),
    // Free text: yours to get, and to tick off when you have it.
    name: z.string().trim().max(200),
    source: z.string().trim().max(200),
    quantity: z.number().positive(),
  })
  .refine((value) => value.productId != null || value.name !== "", {
    message: "Pick a product or type what it is.",
  });

export type OneOffInput = z.input<typeof oneOffSchema>;

// Something for this order only, which stays off the list.
export async function addOneOff(input: OneOffInput) {
  const parsed = oneOffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: z.prettifyError(parsed.error) };
  }
  const { productId, name, source, quantity } = parsed.data;
  try {
    const orderId = await resolveEditableOrder(parsed.data.orderId);
    if (productId != null) {
      const product = await db.query.supplierProducts.findFirst({
        where: eq(supplierProducts.id, productId),
      });
      if (!product) return { ok: false as const, error: "Product not found." };
      await db.insert(orderLines).values({
        orderId,
        itemNo: product.itemNo,
        supplierId: product.supplierId,
        name: product.description,
        unitOfMeasure: product.unitOfMeasure,
        unitPrice: product.unitPrice,
        quantity,
      });
    } else {
      await db
        .insert(orderLines)
        .values({ orderId, name, source: source || null, quantity });
    }
    revalidateOrderScreens();
    return { ok: true as const, orderId };
  } catch (error) {
    return failure(error, "Could not add the one-off.");
  }
}

// Sent orders can still grow: forgot something, or it needs more after all.
// What has gone out can't be taken back from here, so that's the lower limit.
async function resolveEditableOrder(orderId: number | null) {
  if (orderId != null) {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { status: true },
    });
    if (order?.status === "sent") return orderId;
  }
  return resolveDraft(orderId);
}

export async function setOneOffQuantity(lineId: number, quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, error: "Invalid quantity." };
  }
  try {
    const line = await db.query.orderLines.findFirst({
      where: eq(orderLines.id, lineId),
      columns: { sentQuantity: true },
    });
    if (!line) return { ok: false as const, error: "That line is gone." };
    if (quantity < line.sentQuantity) {
      return {
        ok: false as const,
        error: `${formatNumber(line.sentQuantity)} already went out.`,
      };
    }
    if (quantity === 0) {
      await db.delete(orderLines).where(eq(orderLines.id, lineId));
      revalidateOrderScreens();
    } else {
      await db
        .update(orderLines)
        .set({ quantity })
        .where(eq(orderLines.id, lineId));
    }
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the amount.");
  }
}

// A note that turned out to be something to get. It moves to the order, so it
// doesn't stay behind to be handled twice.
export async function noteToOneOff(noteId: number, orderId: number | null) {
  try {
    const note = await db.query.assortmentItems.findFirst({
      where: and(
        eq(assortmentItems.id, noteId),
        eq(assortmentItems.kind, "note")
      ),
      columns: { name: true },
    });
    if (!note) return { ok: false as const, error: "That note is gone." };
    const name = note.name.trim();
    if (!name) {
      return { ok: false as const, error: "Write something in the note first." };
    }
    const draftId = await resolveDraft(orderId);
    await db.batch([
      db
        .insert(orderLines)
        .values({ orderId: draftId, name, quantity: 1 }),
      db.delete(assortmentItems).where(eq(assortmentItems.id, noteId)),
    ]);
    revalidateOrderScreens();
    return { ok: true as const, orderId: draftId };
  } catch (error) {
    return failure(error, "Could not move the note to the order.");
  }
}

export async function clearDraft(orderId: number) {
  try {
    await resolveDraft(orderId);
    await db.delete(orderLines).where(eq(orderLines.orderId, orderId));
    revalidateOrderScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not clear the list.");
  }
}

// A second order next to the current one, which becomes the one you work on.
export async function createDraft(name: string) {
  try {
    const [created] = await db
      .insert(orders)
      .values({ name: name.trim().slice(0, 80) || null })
      .returning({ id: orders.id });
    await rememberCurrentOrder(created.id);
    revalidateOrderScreens();
    return { ok: true as const, orderId: created.id };
  } catch (error) {
    return failure(error, "Could not start the order.");
  }
}

export async function switchDraft(orderId: number) {
  try {
    await resolveDraft(orderId);
    await rememberCurrentOrder(orderId);
    revalidatePath("/order-list");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not switch orders.");
  }
}

// Notes are deleted right from the list, without going through a dialog.
export async function deleteNote(itemId: number) {
  try {
    await db.delete(assortmentItems).where(eq(assortmentItems.id, itemId));
    revalidatePath("/order-list");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the note.");
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
    revalidatePath("/order-list");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the category.");
  }
}

// Quick note lines: created empty and typed straight into the list.
export async function createNote(categoryId: number, text = "") {
  try {
    const [created] = await db
      .insert(assortmentItems)
      .values({
        categoryId,
        kind: "note",
        name: text,
        position: await nextItemPosition(categoryId),
      })
      .returning({ id: assortmentItems.id });
    revalidatePath("/order-list");
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
    revalidatePath("/order-list");
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
    revalidatePath("/order-list");
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the new order.");
  }
}

export type CartSubmitResult = {
  ok: true;
  orderId: number;
  // To paste into "Uw referentie" at Rust's checkout.
  reference: string;
  added: { name: string; itemNo: string; quantity: number }[];
  failed: { name: string; itemNo: string; quantity: number; error: string }[];
  notesCleared: number;
  // The supplier's own cart totals after the last successful add.
  cart?: { totalItems?: number; totalQuantity?: number; totalPrice?: string };
};

// Sends the reviewed order lines to the supplier's cart in one call. The
// caller passes exactly what was on screen; if the order has changed since,
// nothing is sent — ordering should never include something unreviewed. That
// goes for the second time too: what's been sent doesn't count anymore, so
// sending twice from the same screen is refused as well.
export async function sendOrderToCart(options: {
  orderId: number;
  clearNotes: boolean;
  reviewed: { id: number; quantity: number }[];
  reviewedManual: { id: number; quantity: number }[];
}): Promise<CartSubmitResult | { ok: false; error: string }> {
  try {
    const review = await getOrderReview(options.orderId);
    if (!review || review.order.status === "closed") {
      return { ok: false as const, error: "This order can't be sent anymore." };
    }
    const { lines, manual } = review;
    if (lines.length === 0 && manual.length === 0) {
      return { ok: false as const, error: "There is nothing to order." };
    }

    const differs = (
      current: { id: number; quantity: number }[],
      seen: { id: number; quantity: number }[]
    ) => {
      const amounts = new Map(seen.map((line) => [line.id, line.quantity]));
      return (
        current.length !== amounts.size ||
        current.some((line) => amounts.get(line.id) !== line.quantity)
      );
    };
    if (
      differs(lines, options.reviewed) ||
      differs(manual, options.reviewedManual)
    ) {
      return {
        ok: false as const,
        error:
          "The order changed while you were reviewing. Reload the page and check it again.",
      };
    }

    const added: CartSubmitResult["added"] = [];
    const failed: CartSubmitResult["failed"] = [];
    const sentIds = new Set<number>();
    const errors = new Map<number, string>();
    let cart: CartSubmitResult["cart"];

    // One request for the whole order instead of one per product. The
    // supplier refuses the batch as a whole over a single bad line, so
    // whatever does not come back accepted is retried on its own, which also
    // tells us which product was the problem.
    //
    // Two lines can be the same product (Queer Beer is on the list twice), and
    // the cart has one amount per product: the portal's own page treats a
    // repeat as an edit. So the cart gets each product once, with the total.
    const products = new Map<string, typeof lines>();
    for (const line of lines) {
      products.set(line.itemNo!, [
        ...(products.get(line.itemNo!) ?? []),
        line,
      ]);
    }
    const totalOf = (group: typeof lines) =>
      group.reduce((sum, line) => sum + line.quantity, 0);

    const bulk = [...products.values()].filter(
      ([line]) => line.supplierId != null
    );
    let accepted = new Set<string>();
    if (bulk.length > 0) {
      try {
        const result = await addManyToSupplierCart(
          bulk.map((group) => ({
            itemNo: group[0].itemNo!,
            supplierId: group[0].supplierId!,
            quantity: totalOf(group),
            unitOfMeasure: group[0].unitOfMeasure,
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

    for (const [itemNo, group] of products) {
      let problem: string | null = null;
      if (!accepted.has(itemNo)) {
        try {
          cart = await addToSupplierCart(itemNo, totalOf(group));
        } catch (error) {
          problem = error instanceof Error ? error.message : "Unknown error";
        }
      }
      for (const line of group) {
        const row = { name: line.name, itemNo, quantity: line.quantity };
        if (problem) {
          failed.push({ ...row, error: problem });
          errors.set(line.id, problem);
        } else {
          added.push(row);
          sentIds.add(line.id);
        }
      }
    }
    // Nothing to send of these, but they're dealt with as far as the order goes.
    for (const line of manual) sentIds.add(line.id);

    // The order keeps what each line was at this moment, and only what made it
    // counts as sent. Whatever failed stays on the order to send again.
    const statements: BatchItem<"sqlite">[] = [...lines, ...manual].map(
      (line) => {
        const snapshot = {
          name: line.name,
          itemNo: line.itemNo,
          supplierId: line.supplierId,
          unitOfMeasure: line.unitOfMeasure,
          unitPrice: line.unitPrice,
          cartError: errors.get(line.id) ?? null,
        };
        return db
          .update(orderLines)
          .set(
            sentIds.has(line.id)
              ? { ...snapshot, sentQuantity: sql`${orderLines.quantity}` }
              : snapshot
          )
          .where(eq(orderLines.id, line.id));
      }
    );
    if (sentIds.size > 0 && review.order.status === "draft") {
      statements.push(
        db
          .update(orders)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(orders.id, options.orderId))
      );
    }
    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );

    // Notes are only dropped when the whole order went through.
    let notesCleared = 0;
    if (options.clearNotes && failed.length === 0) {
      const removed = await db
        .delete(assortmentItems)
        .where(eq(assortmentItems.kind, "note"))
        .returning({ id: assortmentItems.id });
      notesCleared = removed.length;
    }

    revalidateOrderScreens();
    return {
      ok: true as const,
      orderId: options.orderId,
      reference: orderReference(options.orderId),
      added,
      failed,
      notesCleared,
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
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the image.");
  }
}

export async function removeItemImage(itemId: number) {
  try {
    await deleteItemImage(itemId);
    revalidateItemScreens();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not remove the image.");
  }
}
