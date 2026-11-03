"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderDocumentRejections,
  orderDocuments,
  orderLines,
  orders,
  supplierInvoices,
  supplierOrders,
} from "@/db/schema";
import {
  getCurrentDraftId,
  getDrafts,
  resolveDraft,
} from "@/lib/orders/drafts";
import { linkOrderDocuments, unlinkDocument } from "@/lib/orders/link";
import { orderLabel } from "@/lib/orders/reference";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

function revalidateOrders() {
  revalidatePath("/orders", "layout");
  revalidatePath("/order-list");
  revalidatePath("/order-list/review");
}

export async function renameOrder(orderId: number, name: string) {
  try {
    await db
      .update(orders)
      .set({ name: name.trim().slice(0, 80) || null, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not rename the order.");
  }
}

// Only drafts: what was sent is a record of what happened, so it gets closed
// instead.
export async function deleteDraft(orderId: number) {
  try {
    await db
      .delete(orderLines)
      .where(
        and(
          eq(orderLines.orderId, orderId),
          sql`exists (select 1 from orders where orders.id = ${orderId} and orders.status = 'draft')`
        )
      );
    await db
      .delete(orders)
      .where(and(eq(orders.id, orderId), eq(orders.status, "draft")));
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not delete the order.");
  }
}

export async function setOrderClosed(orderId: number, closed: boolean) {
  try {
    await db
      .update(orders)
      .set({
        status: closed ? "closed" : "sent",
        closedAt: closed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.status, closed ? "sent" : "closed")
        )
      );
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not change the order.");
  }
}

// Ties one of Rust's documents to an order, whether you confirmed a suggestion
// or picked it yourself.
export async function linkDocument(
  orderId: number,
  documentNo: string,
  source: "suggested" | "manual"
) {
  try {
    const existing = await db
      .select({ orderId: orders.id, name: orders.name })
      .from(orderDocuments)
      .innerJoin(orders, eq(orders.id, orderDocuments.orderId))
      .where(eq(orderDocuments.documentNo, documentNo));
    if (existing[0]) {
      const owner = { id: existing[0].orderId, name: existing[0].name };
      return {
        ok: false as const,
        error: `${documentNo} is already on ${orderLabel(owner)}. Unlink it there first.`,
      };
    }

    const rustOrder = await db.query.supplierOrders.findFirst({
      where: eq(supplierOrders.orderNo, documentNo),
      columns: { orderNo: true },
    });
    const posted = rustOrder
      ? null
      : await db.query.supplierInvoices.findFirst({
          where: eq(supplierInvoices.documentNo, documentNo),
          columns: { documentType: true },
        });
    const documentType = rustOrder ? "order" : posted?.documentType;
    if (!documentType || (!rustOrder && documentType === "order")) {
      return { ok: false as const, error: `${documentNo} wasn't found.` };
    }

    await db.batch([
      db
        .delete(orderDocumentRejections)
        .where(
          and(
            eq(orderDocumentRejections.orderId, orderId),
            eq(orderDocumentRejections.documentNo, documentNo)
          )
        ),
      db.insert(orderDocuments).values({
        orderId,
        documentNo,
        documentType,
        source,
      }),
    ]);
    // A Rust order's invoice may already be in.
    await linkOrderDocuments();
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not link the document.");
  }
}

export async function rejectSuggestion(orderId: number, documentNo: string) {
  try {
    await db
      .insert(orderDocumentRejections)
      .values({ orderId, documentNo })
      .onConflictDoNothing();
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not dismiss the suggestion.");
  }
}

export async function unlinkOrderDocument(orderId: number, documentNo: string) {
  try {
    await unlinkDocument(orderId, documentNo);
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not unlink the document.");
  }
}

// Ticking off by hand: for what never shows on an invoice, or came another way.
export async function setReceived(lineId: number, quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, error: "Invalid quantity." };
  }
  try {
    await db
      .update(orderLines)
      .set({ receivedQuantity: quantity })
      .where(eq(orderLines.id, lineId));
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save the amount.");
  }
}

// "That's fine", "that's what came instead", or back to undecided.
export async function setResolution(
  lineId: number,
  resolution: "accepted" | "substituted" | null,
  substituteItemNo: string | null = null
) {
  if (resolution === "substituted" && !substituteItemNo) {
    return { ok: false as const, error: "Which product came instead?" };
  }
  try {
    await db
      .update(orderLines)
      .set({
        resolution,
        substituteItemNo: resolution === "substituted" ? substituteItemNo : null,
      })
      .where(eq(orderLines.id, lineId));
    revalidateOrders();
    return { ok: true as const };
  } catch (error) {
    return failure(error, "Could not save that.");
  }
}

// Puts what didn't come on the order you're working on, and settles it on the
// old one: it's the new order's business now, and shouldn't show up twice.
export async function reorderShortage(lineId: number, shortBy: number) {
  if (!Number.isFinite(shortBy) || shortBy <= 0) {
    return { ok: false as const, error: "Nothing to order again." };
  }
  try {
    const line = await db.query.orderLines.findFirst({
      where: eq(orderLines.id, lineId),
    });
    if (!line) return { ok: false as const, error: "That line is gone." };

    const current = await getCurrentDraftId(await getDrafts());
    const orderId = await resolveDraft(current);
    if (orderId === line.orderId) {
      return { ok: false as const, error: "It's already on this order." };
    }

    const addition = {
      orderId,
      itemId: line.itemId,
      itemNo: line.itemNo,
      supplierId: line.supplierId,
      name: line.name,
      unitOfMeasure: line.unitOfMeasure,
      unitPrice: line.unitPrice,
      source: line.source,
      quantity: shortBy,
    };
    await db.batch([
      line.itemId
        ? db
            .insert(orderLines)
            .values(addition)
            .onConflictDoUpdate({
              target: [orderLines.orderId, orderLines.itemId],
              set: { quantity: sql`${orderLines.quantity} + ${shortBy}` },
            })
        : db.insert(orderLines).values(addition),
      db
        .update(orderLines)
        .set({ resolution: "accepted", substituteItemNo: null })
        .where(eq(orderLines.id, lineId)),
    ]);
    revalidateOrders();
    return { ok: true as const, orderId };
  } catch (error) {
    return failure(error, "Could not add it to the current order.");
  }
}
