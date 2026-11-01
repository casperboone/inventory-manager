import { sql } from "drizzle-orm";

// What a unit actually cost on a line, discount included. Only lines that
// bought something have one: returns have a negative quantity, and a line
// without a quantity has nothing to divide by. Shows as the list price there.
export function netUnitPrice(quantity: number | null, amount: number | null) {
  return quantity != null && quantity > 0 && amount != null
    ? amount / quantity
    : null;
}

// The same rule for queries on supplier_invoice_lines.
export const NET_UNIT_PRICE_SQL = sql`case when quantity > 0 then amount / quantity end`;
