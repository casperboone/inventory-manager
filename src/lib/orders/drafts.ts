import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItemImages,
  assortmentItems,
  orderDocuments,
  orderLines,
  orders,
  supplierProducts,
} from "@/db/schema";

// Remembers the draft you last worked on, per device: the phone on the walk
// around the stock shouldn't jump to a draft someone started on the laptop.
const CURRENT_ORDER_COOKIE = "current-order";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function rememberCurrentOrder(orderId: number) {
  const store = await cookies();
  store.set(CURRENT_ORDER_COOKIE, String(orderId), {
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: true,
  });
}

export type DraftSummary = {
  id: number;
  name: string | null;
  lineCount: number;
};

export async function getDrafts(): Promise<DraftSummary[]> {
  return db
    .select({
      id: orders.id,
      name: orders.name,
      lineCount: count(orderLines.id),
    })
    .from(orders)
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(eq(orders.status, "draft"))
    .groupBy(orders.id)
    .orderBy(desc(orders.id));
}

// The draft this device works on: the one it last used if that's still a draft,
// otherwise the newest there is.
export async function getCurrentDraftId(drafts: DraftSummary[]) {
  const store = await cookies();
  const remembered = Number(store.get(CURRENT_ORDER_COOKIE)?.value);
  return (
    drafts.find((draft) => draft.id === remembered)?.id ??
    drafts[0]?.id ??
    null
  );
}

// What the first tap of a new order needs. With an id, it has to still be a
// draft: an amount meant for an order that has since been sent must not end up
// in another one without you noticing.
export async function resolveDraft(orderId: number | null) {
  if (orderId != null) {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { status: true },
    });
    if (order?.status !== "draft") {
      throw new Error(
        "This order isn't a draft anymore. Reload the page to continue."
      );
    }
    return orderId;
  }

  const newest = await db.query.orders.findFirst({
    where: eq(orders.status, "draft"),
    orderBy: desc(orders.id),
    columns: { id: true },
  });
  if (newest) return newest.id;

  const [created] = await db
    .insert(orders)
    .values({})
    .returning({ id: orders.id });
  await rememberCurrentOrder(created.id);
  return created.id;
}

// Per item, for the + and − on the order list.
export async function getDraftQuantities(
  orderId: number | null
): Promise<Record<number, number>> {
  if (orderId == null) return {};
  const rows = await db
    .select({ itemId: orderLines.itemId, quantity: orderLines.quantity })
    .from(orderLines)
    .where(and(eq(orderLines.orderId, orderId), isNotNull(orderLines.itemId)));
  return Object.fromEntries(rows.map((row) => [row.itemId!, row.quantity]));
}

export type OneOff = {
  id: number;
  name: string;
  itemNo: string | null;
  unitOfMeasure: string | null;
  unitPrice: number | null;
  source: string | null;
  quantity: number;
};

// What's on the order without being on the list.
export async function getOneOffs(orderId: number | null): Promise<OneOff[]> {
  if (orderId == null) return [];
  return db
    .select({
      id: orderLines.id,
      name: orderLines.name,
      itemNo: orderLines.itemNo,
      unitOfMeasure: orderLines.unitOfMeasure,
      unitPrice: orderLines.unitPrice,
      source: orderLines.source,
      quantity: orderLines.quantity,
    })
    .from(orderLines)
    .where(and(eq(orderLines.orderId, orderId), isNull(orderLines.itemId)))
    .orderBy(orderLines.id);
}

// How much of an item is on drafts, for its page.
export async function getDraftedQuantity(itemId: number) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${orderLines.quantity}), 0)` })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(eq(orderLines.itemId, itemId), eq(orders.status, "draft")));
  return row?.total ?? 0;
}

export type ReviewLine = {
  id: number;
  itemId: number | null;
  name: string;
  itemNo: string | null;
  supplierId: number | null;
  unitOfMeasure: string | null;
  unitPrice: number | null;
  // What still has to go out, which on a sent order is less than the line.
  quantity: number;
  source: string | null;
  cartError: string | null;
  categoryName: string | null;
  supplierRemoved: boolean;
  hasOwnImage: boolean;
  imageStatus: "available" | "none" | null;
};

export type OrderReview = {
  order: { id: number; name: string | null; status: "draft" | "sent" | "closed" };
  // Can be added to the supplier cart automatically.
  lines: ReviewLine[];
  // No usable catalog link, or free text: these are yours to handle.
  manual: ReviewLine[];
};

// The lines of an order that haven't gone out yet, with the item's details as
// they are now. Those replace the line's own copy when it's sent.
export async function getOrderReview(
  orderId: number
): Promise<OrderReview | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, name: true, status: true },
  });
  if (!order) return null;

  const rows = await db
    .select({
      id: orderLines.id,
      itemId: orderLines.itemId,
      lineName: orderLines.name,
      lineItemNo: orderLines.itemNo,
      lineSupplierId: orderLines.supplierId,
      lineUnit: orderLines.unitOfMeasure,
      linePrice: orderLines.unitPrice,
      quantity: orderLines.quantity,
      sentQuantity: orderLines.sentQuantity,
      source: orderLines.source,
      cartError: orderLines.cartError,
      itemName: assortmentItems.name,
      categoryName: assortmentCategories.name,
      productId: supplierProducts.id,
      itemNo: supplierProducts.itemNo,
      supplierId: supplierProducts.supplierId,
      unitOfMeasure: supplierProducts.unitOfMeasure,
      unitPrice: supplierProducts.unitPrice,
      imageStatus: supplierProducts.imageStatus,
      removedAt: supplierProducts.removedAt,
      ownImageId: assortmentItemImages.itemId,
    })
    .from(orderLines)
    .leftJoin(assortmentItems, eq(assortmentItems.id, orderLines.itemId))
    .leftJoin(
      assortmentCategories,
      eq(assortmentCategories.id, assortmentItems.categoryId)
    )
    // An item says for itself what it's linked to; what has no item (anymore)
    // goes by the number on the line.
    .leftJoin(
      supplierProducts,
      sql`case when ${assortmentItems.id} is not null
        then ${supplierProducts.id} = ${assortmentItems.supplierProductId}
        else ${supplierProducts.itemNo} = ${orderLines.itemNo} end`
    )
    .leftJoin(
      assortmentItemImages,
      eq(assortmentItemImages.itemId, assortmentItems.id)
    )
    .where(eq(orderLines.orderId, orderId))
    .orderBy(
      sql`${assortmentCategories.position} is null`,
      assortmentCategories.position,
      assortmentItems.position,
      orderLines.id
    );

  const unsent: ReviewLine[] = rows
    .filter((row) => row.quantity > row.sentQuantity)
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      name: row.itemName ?? row.lineName,
      itemNo: row.itemNo,
      supplierId: row.supplierId,
      unitOfMeasure: row.productId ? row.unitOfMeasure : row.lineUnit,
      unitPrice: row.productId ? row.unitPrice : row.linePrice,
      quantity: row.quantity - row.sentQuantity,
      source: row.source,
      cartError: row.cartError,
      categoryName: row.categoryName,
      supplierRemoved: row.removedAt !== null && row.removedAt !== undefined,
      hasOwnImage: row.ownImageId !== null,
      imageStatus: row.imageStatus,
    }));

  return {
    order,
    lines: unsent.filter((line) => line.itemNo && !line.supplierRemoved),
    manual: unsent.filter((line) => !line.itemNo || line.supplierRemoved),
  };
}

// Sent orders Rust hasn't shown anything for yet. They may well still be in
// the cart, and whatever goes in next would end up on the same Rust order.
export async function getOrdersPossiblyInCart(exceptOrderId: number) {
  const sent = await db
    .select({ id: orders.id, name: orders.name, sentAt: orders.sentAt })
    .from(orders)
    .where(eq(orders.status, "sent"));
  const others = sent.filter((order) => order.id !== exceptOrderId);
  if (others.length === 0) return [];

  const linked = await db
    .selectDistinct({ orderId: orderDocuments.orderId })
    .from(orderDocuments)
    .where(
      inArray(
        orderDocuments.orderId,
        others.map((order) => order.id)
      )
    );
  const withDocuments = new Set(linked.map((row) => row.orderId));
  return others.filter((order) => !withDocuments.has(order.id));
}
