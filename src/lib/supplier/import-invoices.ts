import { eq, inArray } from "drizzle-orm";
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
  type InvoiceHeader,
  type InvoiceLine,
  type PostedKind,
} from "./invoice-service";
import { failImportRun, finishImportRun, startImportRun } from "./import-runs";

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

  const run = await startImportRun("documents");
  // Filled in as the run goes, because what it did before failing stays done:
  // posted documents are stored one at a time.
  const progress = {
    invoicesCount: 0,
    creditMemosCount: 0,
    linesCount: 0,
    openOrdersCount: null as number | null,
    openEntriesCount: null as number | null,
  };

  try {
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
      incomplete,
      (lines) => {
        progress.invoicesCount++;
        progress.linesCount += lines;
      }
    );
    // Credit notes are few, so whatever is left of the batch is plenty.
    const creditMemos = await importPosted(
      "PostedCreditMemos",
      known,
      Math.max(5, batch - invoices.imported),
      incomplete,
      (lines) => {
        progress.creditMemosCount++;
        progress.linesCount += lines;
      }
    );
    const openOrders = await refreshOpenOrders();
    progress.openOrdersCount = openOrders;
    const openEntries = await refreshOpenEntries();
    progress.openEntriesCount = openEntries;

    const remaining = invoices.remaining + creditMemos.remaining;
    await finishImportRun(run.id, { ...progress, remainingCount: remaining });

    logger.info(
      `Import #${run.id} succeeded: ${progress.invoicesCount} invoices, ${progress.creditMemosCount} credit notes, ${progress.linesCount} lines, ${remaining} remaining, ${openOrders} open orders and ${openEntries} open entries refreshed.`
    );
    return {
      imported: progress.invoicesCount,
      lines: progress.linesCount,
      remaining,
      total: invoices.total,
      openOrders,
      creditMemos: progress.creditMemosCount,
      openEntries,
    };
  } catch (error) {
    await failImportRun(run.id, error, progress);
    throw error;
  }
}

function insertDocument(
  document: InvoiceHeader,
  lines: InvoiceLine[],
  documentType: "invoice" | "creditmemo" | "order"
): BatchItem<"sqlite">[] {
  return [
    db.insert(supplierInvoices).values({
      documentNo: document.documentNo,
      documentType,
      documentDate: document.documentDate,
      amount: document.amount,
      amountIncludingVat: document.amountIncludingVat,
      yourReference: document.yourReference,
      salespersonCode: document.salespersonCode,
      requestedDeliveryDate: document.requestedDeliveryDate,
      promisedDeliveryDate: document.promisedDeliveryDate,
      lineCount: lines.length,
      // The same clock as the run's start and finish, which is how a run's
      // page finds the documents it read.
      importedAt: new Date(),
    }),
    ...lines.map((line) =>
      db.insert(supplierInvoiceLines).values({
        documentNo: document.documentNo,
        documentType,
        documentDate: document.documentDate,
        itemNo: line.itemNo,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        amount: line.amount,
      })
    ),
  ];
}

// Walks a posted-document list newest first and stores the ones we lack.
async function importPosted(
  kind: PostedKind,
  known: Set<string>,
  batch: number,
  incomplete: Set<string>,
  onStored: (lines: number) => void
) {
  const documentType = kind === "PostedInvoices" ? "invoice" : "creditmemo";
  const missing: InvoiceHeader[] = [];
  const toComplete: InvoiceHeader[] = [];
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

  for (const [index, invoice] of toImport.entries()) {
    if (index > 0) await pauseBetweenInvoices();
    const lines = await fetchInvoiceLines(invoice.documentNo, kind);
    await db.batch(
      insertDocument(invoice, lines, documentType) as [
        BatchItem<"sqlite">,
        ...BatchItem<"sqlite">[],
      ]
    );
    onStored(lines.length);
  }

  await completeHeaders(toComplete);

  return {
    imported: toImport.length,
    remaining: missing.length - toImport.length,
    total,
  };
}

// Fills in the header fields of documents imported before we read them.
async function completeHeaders(
  documents: InvoiceHeader[]
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
//
// Everything is fetched before anything is written, and written in one batch
// (one transaction), so a failure anywhere leaves the old rows in place.
async function refreshOpenOrders(): Promise<number> {
  const orders = await fetchOpenOrders();
  const fetched: { order: InvoiceHeader; lines: InvoiceLine[] }[] = [];
  for (const [index, order] of orders.entries()) {
    if (index > 0) await pauseBetweenInvoices();
    fetched.push({ order, lines: await fetchOrderLines(order.documentNo) });
  }

  // An order that has been invoiced disappears from the open list; its rows go
  // along with the rest, so the invoice becomes the authority.
  const stored = await db
    .select({ documentNo: supplierInvoices.documentNo })
    .from(supplierInvoices)
    .where(eq(supplierInvoices.documentType, "order"));
  const replaced = [
    ...new Set([
      ...stored.map((row) => row.documentNo),
      ...orders.map((order) => order.documentNo),
    ]),
  ];
  if (replaced.length === 0) return 0;

  const statements: BatchItem<"sqlite">[] = [
    db
      .delete(supplierInvoiceLines)
      .where(inArray(supplierInvoiceLines.documentNo, replaced)),
    db
      .delete(supplierInvoices)
      .where(inArray(supplierInvoices.documentNo, replaced)),
    ...fetched.flatMap(({ order, lines }) =>
      insertDocument(order, lines, "order")
    ),
  ];
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return orders.length;
}

// Outstanding payments change without us doing anything (they are settled by
// bank transfer), so the whole list is replaced on every run, in one batch so
// a failure leaves the old list in place.
async function refreshOpenEntries(): Promise<number> {
  const entries = await fetchOpenEntries();

  const statements: BatchItem<"sqlite">[] = [db.delete(supplierOpenEntries)];
  if (entries.length > 0) {
    statements.push(
      db.insert(supplierOpenEntries).values(
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
      )
    );
  }
  // The outstanding list is the only place that names the order an invoice
  // came from, so the link is recorded while it is there to be had.
  for (const entry of entries) {
    if (!entry.orderNo) continue;
    statements.push(
      db
        .update(supplierInvoices)
        .set({ orderNo: entry.orderNo })
        .where(eq(supplierInvoices.documentNo, entry.documentNo))
    );
  }
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return entries.length;
}
