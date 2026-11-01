import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { DiscountStatus } from "./discount-types";

export type { DiscountStatus, ProductDiscount } from "./discount-types";
export { listUnitPrice } from "./discount-types";

type Row = {
  item_no: string;
  discount_percent: number;
  unit_price: number | null;
  document_date: number | null;
  document_no: string;
  document_type: "invoice" | "order";
};

// The most recent line per product, which is the discount currently in force
// as far as we can tell. A credit note says nothing about that, and a line
// without a percentage counts as no discount. Everything that shows or filters
// on the current discount reads it from here, so they can't disagree.
export function latestDiscountLines(itemNos?: string[]) {
  const itemFilter = itemNos ? sql`and item_no in ${itemNos}` : sql``;
  return sql`(
    select item_no, coalesce(discount_percent, 0) as discount_percent,
           unit_price, document_date, document_no, document_type
    from (
      select
        item_no, discount_percent, unit_price, document_date, document_no,
        document_type,
        row_number() over (
          partition by item_no order by document_date desc, id desc
        ) as rn
      from supplier_invoice_lines
      where document_type in ('invoice', 'order')
        ${itemFilter}
    )
    where rn = 1
  )`;
}

export async function getDiscountStatuses(
  itemNos: string[]
): Promise<Map<string, DiscountStatus>> {
  const statuses = new Map<string, DiscountStatus>();
  if (itemNos.length === 0) return statuses;

  const rows = await db.all<Row>(
    sql`select * from ${latestDiscountLines(itemNos)}`
  );

  for (const row of rows) {
    const invoicedAt = row.document_date
      ? new Date(row.document_date * 1000)
      : null;
    const percent = row.discount_percent;

    statuses.set(
      row.item_no,
      percent > 0
        ? {
            kind: "discount",
            discount: {
              percent,
              amountPerUnit: ((row.unit_price ?? 0) * percent) / 100,
              invoicedUnitPrice: row.unit_price,
              invoicedAt,
              documentNo: row.document_no,
              documentType: row.document_type,
            },
          }
        : { kind: "none", invoicedAt, documentType: row.document_type }
    );
  }

  return statuses;
}

export async function getDiscountSummary() {
  const latest = latestDiscountLines();
  const [row] = await db.all<{
    invoices: number;
    items: number;
    withDiscount: number;
    latest: number | null;
  }>(sql`
    select
      (select count(*) from supplier_invoices) as invoices,
      (select count(*) from ${latest}) as items,
      (select count(*) from ${latest} where discount_percent > 0) as withDiscount,
      (select max(document_date) from supplier_invoices) as latest
  `);

  return {
    invoices: row?.invoices ?? 0,
    items: row?.items ?? 0,
    withDiscount: row?.withDiscount ?? 0,
    latest: row?.latest ? new Date(row.latest * 1000) : null,
  };
}
