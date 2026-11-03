import { eq, inArray, isNotNull, ne, and } from "drizzle-orm";
import { db } from "@/db";
import {
  orderDocumentRejections,
  orderDocuments,
  orders,
  supplierInvoices,
  supplierOrders,
} from "@/db/schema";
import { parseOrderReference } from "./reference";

// What can be linked without asking: a document with our reference on it, and
// the invoice of a Rust order that's already linked. Runs after every document
// import, and after linking by hand. Anything you've unlinked stays unlinked.
export async function linkOrderDocuments() {
  const sent = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.status, "sent"));
  const sentIds = new Set(sent.map((order) => order.id));

  const [rejections, linked, rustOrders, posted] = await Promise.all([
    db.select().from(orderDocumentRejections),
    db.select().from(orderDocuments),
    db
      .select({
        documentNo: supplierOrders.orderNo,
        reference: supplierOrders.yourReference,
      })
      .from(supplierOrders)
      .where(isNotNull(supplierOrders.yourReference)),
    db
      .select({
        documentNo: supplierInvoices.documentNo,
        documentType: supplierInvoices.documentType,
        reference: supplierInvoices.yourReference,
        orderNo: supplierInvoices.orderNo,
      })
      .from(supplierInvoices)
      .where(ne(supplierInvoices.documentType, "order")),
  ]);

  const taken = new Set(linked.map((link) => link.documentNo));
  const refused = new Set(
    rejections.map((row) => `${row.orderId}:${row.documentNo}`)
  );
  const links: (typeof orderDocuments.$inferInsert)[] = [];
  const add = (
    orderId: number,
    documentNo: string,
    documentType: "order" | "invoice" | "creditmemo",
    source: "reference" | "followed"
  ) => {
    if (taken.has(documentNo) || refused.has(`${orderId}:${documentNo}`)) return;
    taken.add(documentNo);
    links.push({ orderId, documentNo, documentType, source });
  };

  const byReference = (reference: string | null) => {
    const orderId = parseOrderReference(reference);
    return orderId !== null && sentIds.has(orderId) ? orderId : null;
  };
  for (const order of rustOrders) {
    const orderId = byReference(order.reference);
    if (orderId !== null) add(orderId, order.documentNo, "order", "reference");
  }
  for (const document of posted) {
    const orderId = byReference(document.reference);
    if (orderId !== null) {
      add(
        orderId,
        document.documentNo,
        document.documentType as "invoice" | "creditmemo",
        "reference"
      );
    }
  }

  // Rust orders we now know about, the new ones included.
  const ownerOf = new Map(
    [...linked, ...links]
      .filter((link) => link.documentType === "order")
      .map((link) => [link.documentNo, link.orderId])
  );
  for (const document of posted) {
    const orderId = document.orderNo ? ownerOf.get(document.orderNo) : undefined;
    if (orderId !== undefined && sentIds.has(orderId)) {
      add(
        orderId,
        document.documentNo,
        document.documentType as "invoice" | "creditmemo",
        "followed"
      );
    }
  }

  if (links.length > 0) {
    await db.insert(orderDocuments).values(links).onConflictDoNothing();
  }
  return links.length;
}

// Unlinking a Rust order takes its invoices along, or they'd keep the order
// half linked. They're remembered as refused, so a later import leaves them.
export async function unlinkDocument(orderId: number, documentNo: string) {
  const followed = await db
    .select({ documentNo: orderDocuments.documentNo })
    .from(orderDocuments)
    .innerJoin(
      supplierInvoices,
      eq(supplierInvoices.documentNo, orderDocuments.documentNo)
    )
    .where(
      and(
        eq(orderDocuments.orderId, orderId),
        eq(orderDocuments.source, "followed"),
        eq(supplierInvoices.orderNo, documentNo)
      )
    );
  const numbers = [documentNo, ...followed.map((row) => row.documentNo)];

  await db.batch([
    db
      .delete(orderDocuments)
      .where(
        and(
          eq(orderDocuments.orderId, orderId),
          inArray(orderDocuments.documentNo, numbers)
        )
      ),
    db
      .insert(orderDocumentRejections)
      .values(numbers.map((number) => ({ orderId, documentNo: number })))
      .onConflictDoNothing(),
  ]);
}
