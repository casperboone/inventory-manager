import { desc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { supplierInvoiceLines, supplierInvoices } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  fetchInvoiceLines,
  fetchInvoiceList,
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
};

export async function importSupplierInvoices(
  options: { batch?: number } = {}
): Promise<InvoiceImportResult> {
  const batch = options.batch ?? DEFAULT_BATCH;

  const known = new Set(
    (
      await db
        .select({ documentNo: supplierInvoices.documentNo })
        .from(supplierInvoices)
    ).map((row) => row.documentNo)
  );

  const invoices = await importPosted("PostedInvoices", known, batch);
  // Credit notes are few, so whatever is left of the batch is plenty.
  const creditMemos = await importPosted(
    "PostedCreditMemos",
    known,
    Math.max(5, batch - invoices.imported)
  );
  const openOrders = await refreshOpenOrders();

  const result = {
    imported: invoices.imported,
    lines: invoices.lines + creditMemos.lines,
    remaining: invoices.remaining + creditMemos.remaining,
    total: invoices.total,
    openOrders,
    creditMemos: creditMemos.imported,
  };
  logger.info(
    `Invoice import: ${result.imported} invoices, ${result.creditMemos} credit notes, ${result.lines} lines, ${result.remaining} remaining, ${openOrders} open orders refreshed.`
  );
  return result;
}

// Walks a posted-document list newest first and stores the ones we lack.
async function importPosted(
  kind: PostedKind,
  known: Set<string>,
  batch: number
) {
  const documentType = kind === "PostedInvoices" ? "invoice" : "creditmemo";
  const missing: Awaited<ReturnType<typeof fetchInvoiceList>>["invoices"] = [];
  let total = 0;
  let start = 0;
  const pageSize = 100;

  while (true) {
    const page = await fetchInvoiceList(start, pageSize, kind);
    total = page.total;
    for (const invoice of page.invoices) {
      if (!known.has(invoice.documentNo)) missing.push(invoice);
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

  return {
    imported: toImport.length,
    lines: lineCount,
    remaining: missing.length - toImport.length,
    total,
  };
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
