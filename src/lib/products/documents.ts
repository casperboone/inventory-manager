import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { supplierInvoiceLines, supplierInvoices } from "@/db/schema";

// Browsing what the supplier sent us: posted invoices, credit notes and the
// orders that have not been invoiced yet.
export type DocumentType = "invoice" | "creditmemo" | "order";

export type DocumentHeader = {
  documentNo: string;
  documentType: DocumentType;
  documentDate: Date | null;
  amount: number | null;
  amountIncludingVat: number | null;
  lineCount: number;
  // Which order an invoice came from, when the outstanding list told us.
  orderNo: string | null;
  yourReference: string | null;
  salespersonCode: string | null;
  // Orders only, and the reason to open one: when it is coming.
  requestedDeliveryDate: Date | null;
  promisedDeliveryDate: Date | null;
};

export type DocumentLine = {
  itemNo: string;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  netUnitPrice: number | null;
  discountPercent: number | null;
  amount: number | null;
};

export const DOCUMENTS_PAGE_SIZE = 50;

function toHeader(
  row: typeof supplierInvoices.$inferSelect
): DocumentHeader {
  return {
    documentNo: row.documentNo,
    documentType: row.documentType,
    documentDate: row.documentDate,
    amount: row.amount,
    amountIncludingVat: row.amountIncludingVat,
    lineCount: row.lineCount,
    orderNo: row.orderNo,
    yourReference: row.yourReference,
    salespersonCode: row.salespersonCode,
    requestedDeliveryDate: row.requestedDeliveryDate,
    promisedDeliveryDate: row.promisedDeliveryDate,
  };
}

function matching(search: string | undefined): SQL | undefined {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // Either the document number itself, or something it contains.
  return or(
    like(supplierInvoices.documentNo, pattern),
    sql`exists (
      select 1 from ${supplierInvoiceLines} l
      where l.document_no = ${supplierInvoices.documentNo}
        and (l.description like ${pattern} escape '\\' or l.item_no like ${pattern} escape '\\')
    )`
  );
}

export async function listDocuments(options: {
  types: DocumentType[];
  search?: string;
  page?: number;
}) {
  const page = Math.max(1, options.page ?? 1);
  const where = and(
    inArray(supplierInvoices.documentType, options.types),
    matching(options.search)
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(supplierInvoices)
      .where(where)
      .orderBy(desc(supplierInvoices.documentDate), desc(supplierInvoices.documentNo))
      .limit(DOCUMENTS_PAGE_SIZE)
      .offset((page - 1) * DOCUMENTS_PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)` })
      .from(supplierInvoices)
      .where(where),
  ]);

  return {
    documents: rows.map(toHeader),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE)),
  };
}

export async function getDocument(documentNo: string) {
  const header = await db.query.supplierInvoices.findFirst({
    where: eq(supplierInvoices.documentNo, documentNo),
  });
  if (!header) return null;

  const rows = await db
    .select()
    .from(supplierInvoiceLines)
    .where(eq(supplierInvoiceLines.documentNo, documentNo))
    .orderBy(supplierInvoiceLines.id);

  // An order we still have a page for can be linked to; once it is invoiced
  // it is dropped, and its number is only worth showing as a reference.
  const order = header.orderNo
    ? await db.query.supplierInvoices.findFirst({
        where: eq(supplierInvoices.documentNo, header.orderNo),
        columns: { documentNo: true },
      })
    : null;

  const lines: DocumentLine[] = rows.map((row) => ({
    itemNo: row.itemNo,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    netUnitPrice:
      row.quantity && row.quantity !== 0 && row.amount != null
        ? row.amount / row.quantity
        : null,
    discountPercent: row.discountPercent,
    amount: row.amount,
  }));

  return {
    header: toHeader(header),
    orderLinked: order != null,
    lines,
    // Handy on the page itself: what the lines add up to and what was saved.
    totals: {
      lines: lines.reduce((sum, line) => sum + (line.amount ?? 0), 0),
      discount: lines.reduce((sum, line) => {
        if (!line.discountPercent || line.unitPrice == null || !line.quantity) {
          return sum;
        }
        return (
          sum + line.unitPrice * line.quantity * (line.discountPercent / 100)
        );
      }, 0),
    },
  };
}

// For the section header: how much we have, and how far it runs.
export async function getDocumentSummary() {
  const [row] = await db.all<{
    invoices: number;
    creditmemos: number;
    orders: number;
    latest: number | null;
  }>(sql`
    select
      sum(document_type = 'invoice') as invoices,
      sum(document_type = 'creditmemo') as creditmemos,
      sum(document_type = 'order') as orders,
      max(case when document_type = 'invoice' then document_date end) as latest
    from supplier_invoices
  `);

  return {
    invoices: row?.invoices ?? 0,
    creditMemos: row?.creditmemos ?? 0,
    orders: row?.orders ?? 0,
    latestInvoice: row?.latest ? new Date(row.latest * 1000) : null,
  };
}

export async function countDocuments() {
  const rows = await db
    .select({
      documentType: supplierInvoices.documentType,
      count: sql<number>`count(*)`,
    })
    .from(supplierInvoices)
    .groupBy(supplierInvoices.documentType);

  const counts = { invoice: 0, creditmemo: 0, order: 0 };
  for (const row of rows) counts[row.documentType] = row.count;
  return counts;
}
