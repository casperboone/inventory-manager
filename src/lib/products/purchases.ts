import { sql } from "drizzle-orm";
import { db } from "@/db";

// What we bought per year, from the invoices and credit notes we imported.
// Credit notes count against the total, open orders are left out because they
// have not been invoiced yet.
//
// Deposits ("emballage") are charged and refunded on the same invoices. They
// are not really purchases, so they can be left out.
const DEPOSIT_MATCH = sql`upper(coalesce(description, '')) like '%EMBALLAGE%'`;
const SIGN = sql`case when document_type = 'creditmemo' then -1 else 1 end`;

export type PurchaseYear = {
  year: string;
  documents: number;
  products: number;
  quantity: number;
  total: number;
  deposits: number;
  // The newest invoice in that year, so you can see how complete it is.
  lastInvoiceDate: Date | null;
};

export type PurchaseLine = {
  itemNo: string;
  description: string;
  quantity: number;
  total: number;
  averageUnitPrice: number | null;
  // What a unit cost on the first and the last document of that year, net of
  // the discount like the average, so you can see how the price moved.
  firstUnitPrice: number | null;
  lastUnitPrice: number | null;
  lastBoughtAt: Date | null;
  documents: number;
  // The line discount on the first and the last document of that year, so you
  // can see what it was back then and which way it went.
  discountPercent: number | null;
  firstDiscountPercent: number | null;
};

export const PURCHASE_SORTS = [
  "description",
  "quantity",
  "price",
  "total",
  "discount",
  "lastBought",
] as const;

export type PurchaseSort = (typeof PURCHASE_SORTS)[number];

function toDate(seconds: number | null) {
  return seconds ? new Date(seconds * 1000) : null;
}

export async function getPurchaseYears(options?: {
  includeDeposits?: boolean;
}): Promise<PurchaseYear[]> {
  const depositFilter = options?.includeDeposits
    ? sql`1 = 1`
    : sql`not ${DEPOSIT_MATCH}`;

  const rows = await db.all<{
    year: string;
    documents: number;
    products: number;
    quantity: number;
    total: number;
    deposits: number;
    last_date: number | null;
  }>(sql`
    select
      strftime('%Y', document_date, 'unixepoch') as year,
      count(distinct document_no) as documents,
      count(distinct case when not ${DEPOSIT_MATCH} then item_no end) as products,
      coalesce(sum(case when ${depositFilter} then ${SIGN} * quantity end), 0) as quantity,
      coalesce(sum(case when ${depositFilter} then ${SIGN} * amount end), 0) as total,
      coalesce(sum(case when ${DEPOSIT_MATCH} then ${SIGN} * amount end), 0) as deposits,
      max(case when document_type = 'invoice' then document_date end) as last_date
    from supplier_invoice_lines
    where document_type in ('invoice', 'creditmemo')
      and document_date is not null
    group by year
    order by year desc
  `);

  return rows.map((row) => ({
    year: row.year,
    documents: row.documents,
    products: row.products,
    quantity: row.quantity,
    total: row.total,
    deposits: row.deposits,
    lastInvoiceDate: toDate(row.last_date),
  }));
}

export async function getPurchaseLines(
  year: string,
  options?: {
    includeDeposits?: boolean;
    sort?: PurchaseSort;
    dir?: "asc" | "desc";
  }
): Promise<PurchaseLine[]> {
  const depositFilter = options?.includeDeposits
    ? sql`1 = 1`
    : sql`not ${DEPOSIT_MATCH}`;

  const direction = options?.dir === "asc" ? sql`asc` : sql`desc`;
  const sortColumn = {
    description: sql`description`,
    quantity: sql`quantity`,
    price: sql`average_price`,
    total: sql`total`,
    discount: sql`discount_percent`,
    lastBought: sql`last_date`,
  }[options?.sort ?? "total"];

  const rows = await db.all<{
    item_no: string;
    description: string | null;
    quantity: number;
    total: number;
    documents: number;
    last_date: number | null;
    average_price: number | null;
    first_price: number | null;
    last_price: number | null;
    discount_percent: number | null;
    first_discount_percent: number | null;
  }>(sql`
    with lines as (
      select
        item_no, description, document_no, document_date, quantity, amount,
        unit_price, discount_percent, ${SIGN} as sign,
        -- What a unit actually cost on this line, so the range matches the
        -- average rather than quoting the price before the discount.
        case when quantity > 0 then amount / quantity end as net_unit_price,
        row_number() over (
          partition by item_no
          order by
            (case when quantity > 0 then 0 else 1 end),
            document_date asc, id asc
        ) as rn_first,
        row_number() over (
          partition by item_no
          order by
            (case when quantity > 0 then 0 else 1 end),
            document_date desc, id desc
        ) as rn_last
      from supplier_invoice_lines
      where document_type in ('invoice', 'creditmemo')
        and strftime('%Y', document_date, 'unixepoch') = ${year}
        and ${depositFilter}
    )
    select
      item_no,
      max(description) as description,
      coalesce(sum(sign * quantity), 0) as quantity,
      coalesce(sum(sign * amount), 0) as total,
      case
        when sum(sign * quantity) > 0
        then sum(sign * amount) / sum(sign * quantity)
      end as average_price,
      max(case when rn_first = 1 then net_unit_price end) as first_price,
      max(case when rn_last = 1 then net_unit_price end) as last_price,
      max(case when rn_last = 1 then discount_percent end) as discount_percent,
      max(case when rn_first = 1 then discount_percent end)
        as first_discount_percent,
      count(distinct document_no) as documents,
      max(document_date) as last_date
    from lines
    group by item_no
    order by ${sortColumn} ${direction}, total desc
  `);

  return rows.map((row) => ({
    itemNo: row.item_no,
    description: row.description ?? row.item_no,
    quantity: row.quantity,
    total: row.total,
    averageUnitPrice: row.average_price,
    firstUnitPrice: row.first_price,
    lastUnitPrice: row.last_price,
    lastBoughtAt: toDate(row.last_date),
    documents: row.documents,
    discountPercent: row.discount_percent,
    firstDiscountPercent: row.first_discount_percent,
  }));
}

export type PurchaseDocumentLine = {
  documentNo: string;
  documentType: "invoice" | "creditmemo";
  documentDate: Date | null;
  quantity: number | null;
  // What the supplier listed before the discount.
  unitPrice: number | null;
  // What a unit actually cost, discount included.
  netUnitPrice: number | null;
  discountPercent: number | null;
  amount: number | null;
};

// Every document a product appears on, for the price progression behind a
// single row. Limited to one year unless asked for everything.
export async function getProductPurchaseHistory(
  itemNo: string,
  options?: { year?: string }
): Promise<PurchaseDocumentLine[]> {
  const yearFilter = options?.year
    ? sql`and strftime('%Y', document_date, 'unixepoch') = ${options.year}`
    : sql``;

  const rows = await db.all<{
    document_no: string;
    document_type: "invoice" | "creditmemo";
    document_date: number | null;
    quantity: number | null;
    unit_price: number | null;
    discount_percent: number | null;
    amount: number | null;
  }>(sql`
    select document_no, document_type, document_date, quantity, unit_price,
           discount_percent, amount
    from supplier_invoice_lines
    where item_no = ${itemNo}
      and document_type in ('invoice', 'creditmemo')
      ${yearFilter}
    order by document_date desc, id desc
  `);

  return rows.map((row) => ({
    documentNo: row.document_no,
    documentType: row.document_type,
    documentDate: toDate(row.document_date),
    quantity: row.quantity,
    unitPrice: row.unit_price,
    netUnitPrice:
      row.quantity && row.quantity > 0 && row.amount != null
        ? row.amount / row.quantity
        : null,
    discountPercent: row.discount_percent,
    amount: row.amount,
  }));
}
