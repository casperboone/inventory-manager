import { desc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import {
  supplierInvoiceLines,
  supplierInvoices,
  supplierOpenEntries,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  fetchInvoiceLines,
  fetchInvoiceList,
  fetchOpenEntries,
  fetchOpenOrders,
  fetchOrderLines,
  pauseBetweenInvoices,
  type PostedKind,
} from "./invoice-service";

// One run fetches at most this many invoices, so a run stays well inside the
// hosting time limit. Press again to continue where it left off.
const DEFAULT_BATCH = 40;

export type InvoiceImportResult = {
  imported: number;
  lines: number;
  remaining: number;
  total: number;
  openOrders: number;
  // Credit notes are imported too; their amounts count against the purchases.
  creditMemos: number;
  // Unpaid invoices and unsettled credit notes, refreshed as a whole.
  openEntries: number;
};

export async function importSupplierInvoices(
  options: { batch?: number } = {}
): Promise<InvoiceImportResult> {
  const batch = options.batch ?? DEFAULT_BATCH;

  const stored = await db
    .select({
      documentNo: supplierInvoices.documentNo,
      amountIncludingVat: supplierInvoices.amountIncludingVat,
    })
    .from(supplierInvoices);
  const known = new Set(stored.map((row) => row.documentNo));
  // Documents imported before we read these fields; filled in from the list,
  // which costs nothing extra because we walk it anyway.
  const incomplete = new Set(
    stored
      .filter((row) => row.amountIncludingVat == null)
      .map((row) => row.documentNo)
  );

  const invoices = await importPosted(
    "PostedInvoices",
    known,
    batch,
    incomplete
  );
  // Credit notes are few, so whatever is left of the batch is plenty.
  const creditMemos = await importPosted(
    "PostedCreditMemos",
    known,
    Math.max(5, batch - invoices.imported),
    incomplete
  );
  const openOrders = await refreshOpenOrders();
  const openEntries = await refreshOpenEntries();

  const result = {
    imported: invoices.imported,
    lines: invoices.lines + creditMemos.lines,
    remaining: invoices.remaining + creditMemos.remaining,
    total: invoices.total,
    openOrders,
    creditMemos: creditMemos.imported,
    openEntries,
  };
  logger.info(
    `Invoice import: ${result.imported} invoices, ${result.creditMemos} credit notes, ${result.lines} lines, ${result.remaining} remaining, ${openOrders} open orders and ${openEntries} open entries refreshed.`
  );
  return result;
}

// Walks a posted-document list newest first and stores the ones we lack.
async function importPosted(
  kind: PostedKind,
  known: Set<string>,
  batch: number,
  incomplete: Set<string>
) {
  const documentType = kind === "PostedInvoices" ? "invoice" : "creditmemo";
  const missing: Awaited<ReturnType<typeof fetchInvoiceList>>["invoices"] = [];
  const toComplete: typeof missing = [];
  let total = 0;
  let start = 0;
  const pageSize = 100;

  while (true) {
    const page = await fetchInvoiceList(start, pageSize, kind);
    total = page.total;
    for (const invoice of page.invoices) {
      if (!known.has(invoice.documentNo)) {
        missing.push(invoice);
      } else if (incomplete.has(invoice.documentNo)) {
        toComplete.push(invoice);
      }
    }
    start += page.invoices.length;
    if (page.invoices.length === 0 || start >= total) break;
  }

  const toImport = missing.slice(0, batch);
  let lineCount = 0;

  for (const [index, invoice] of toImport.entries()) {
    if (index > 0) await pauseBetweenInvoices();
    const lines = await fetchInvoiceLines(invoice.documentNo, kind);

    const statements: BatchItem<"sqlite">[] = [
      db.insert(supplierInvoices).values({
        documentNo: invoice.documentNo,
        documentType,
        documentDate: invoice.documentDate,
        amount: invoice.amount,
        amountIncludingVat: invoice.amountIncludingVat,
        yourReference: invoice.yourReference,
        lineCount: lines.length,
      }),
      ...lines.map((line) =>
        db.insert(supplierInvoiceLines).values({
          documentNo: invoice.documentNo,
          documentType,
          documentDate: invoice.documentDate,
          itemNo: line.itemNo,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          amount: line.amount,
        })
      ),
    ];
    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );
    lineCount += lines.length;
  }

  await completeHeaders(toComplete);

  return {
    imported: toImport.length,
    lines: lineCount,
    remaining: missing.length - toImport.length,
    total,
  };
}

// Fills in the header fields of documents imported before we read them.
async function completeHeaders(
  documents: Awaited<ReturnType<typeof fetchInvoiceList>>["invoices"]
) {
  if (documents.length === 0) return;
  const statements: BatchItem<"sqlite">[] = documents.map((document) =>
    db
      .update(supplierInvoices)
      .set({
        amountIncludingVat: document.amountIncludingVat,
        yourReference: document.yourReference,
      })
      .where(eq(supplierInvoices.documentNo, document.documentNo))
  );
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  logger.info(`Filled in the header fields of ${documents.length} documents.`);
}

// Open orders already know their discounts, weeks before the invoice follows.
// They still change, so they are re-read on every run rather than skipped.
async function refreshOpenOrders(): Promise<number> {
  const orders = await fetchOpenOrders();
  const numbers = orders.map((order) => order.documentNo);
  await dropStaleOpenOrders(numbers);
  if (orders.length === 0) return 0;

  await db
    .delete(supplierInvoiceLines)
    .where(inArray(supplierInvoiceLines.documentNo, numbers));
  await db
    .delete(supplierInvoices)
    .where(inArray(supplierInvoices.documentNo, numbers));

  for (const [index, order] of orders.entries()) {
    if (index > 0) await pauseBetweenInvoices();
    const lines = await fetchOrderLines(order.documentNo);
    const statements: BatchItem<"sqlite">[] = [
      db.insert(supplierInvoices).values({
        documentNo: order.documentNo,
        documentType: "order",
        documentDate: order.documentDate,
        amount: order.amount,
        amountIncludingVat: order.amountIncludingVat,
        yourReference: order.yourReference,
        salespersonCode: order.salespersonCode,
        requestedDeliveryDate: order.requestedDeliveryDate,
        promisedDeliveryDate: order.promisedDeliveryDate,
        lineCount: lines.length,
      }),
      ...lines.map((line) =>
        db.insert(supplierInvoiceLines).values({
          documentNo: order.documentNo,
          documentType: "order",
          documentDate: order.documentDate,
          itemNo: line.itemNo,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          amount: line.amount,
        })
      ),
    ];
    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );
  }

  return orders.length;
}

// Outstanding payments change without us doing anything (they are settled by
// bank transfer), so the whole list is replaced on every run.
async function refreshOpenEntries(): Promise<number> {
  const entries = await fetchOpenEntries();
  await db.delete(supplierOpenEntries);
  if (entries.length === 0) return 0;

  await db.insert(supplierOpenEntries).values(
    entries.map((entry) => ({
      documentNo: entry.documentNo,
      documentType: entry.documentType,
      documentDate: entry.documentDate,
      description: entry.description,
      orderNo: entry.orderNo,
      amount: entry.amount,
      remainingAmount: entry.remainingAmount,
      dueDate: entry.dueDate,
      paymentDiscountDate: entry.paymentDiscountDate,
      refreshedAt: new Date(),
    }))
  );
  // The outstanding list is the only place that names the order an invoice
  // came from, so the link is recorded while it is there to be had.
  const linked = entries.filter((entry) => entry.orderNo);
  if (linked.length > 0) {
    const statements: BatchItem<"sqlite">[] = linked.map((entry) =>
      db
        .update(supplierInvoices)
        .set({ orderNo: entry.orderNo })
        .where(eq(supplierInvoices.documentNo, entry.documentNo))
    );
    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );
  }

  return entries.length;
}

// An order that has been invoiced disappears from the open list; its rows are
// dropped so the invoice becomes the authority.
export async function dropStaleOpenOrders(currentNumbers: string[]) {
  const stored = await db
    .select({ documentNo: supplierInvoices.documentNo })
    .from(supplierInvoices)
    .where(eq(supplierInvoices.documentType, "order"));
  const stale = stored
    .map((row) => row.documentNo)
    .filter((no) => !currentNumbers.includes(no));
  if (stale.length === 0) return 0;

  await db
    .delete(supplierInvoiceLines)
    .where(inArray(supplierInvoiceLines.documentNo, stale));
  await db
    .delete(supplierInvoices)
    .where(inArray(supplierInvoices.documentNo, stale));
  return stale.length;
}

export async function getLatestInvoiceDate() {
  const latest = await db
    .select({ documentDate: supplierInvoices.documentDate })
    .from(supplierInvoices)
    .orderBy(desc(supplierInvoices.documentDate))
    .limit(1);
  return latest[0]?.documentDate ?? null;
}

export async function countInvoices() {
  const rows = await db
    .select({ documentNo: supplierInvoices.documentNo })
    .from(supplierInvoices);
  return rows.length;
}
