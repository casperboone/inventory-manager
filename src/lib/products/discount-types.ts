// Types and pure helpers for product line discounts. Kept free of database
// imports so client components can use them too.

// What we know about a product's line discount ("regelkorting"). The supplier
// only reveals it on invoices, so this is what we were last charged.
//
// Note that the catalog price is the price *after* this discount: comparing
// recent invoices with the catalog, the catalog matches the net price and
// never the gross. The discount therefore says where we have an agreement,
// not that something extra comes off at checkout.
export type ProductDiscount = {
  // Percentage on the invoice line, e.g. 17.59.
  percent: number;
  // The discount in euros per unit. This is what stays constant between
  // invoices; the percentage moves with the price.
  amountPerUnit: number;
  invoicedUnitPrice: number | null;
  invoicedAt: Date | null;
  documentNo: string;
  // Where it came from: a posted invoice, or an order that is still open and
  // therefore knows its discount weeks earlier.
  documentType: "invoice" | "order";
};

export type DiscountStatus =
  // Invoiced with a discount.
  | { kind: "discount"; discount: ProductDiscount }
  // Invoiced, but never with a discount.
  | {
      kind: "none";
      invoicedAt: Date | null;
      documentType: "invoice" | "order";
    }
  // Never invoiced, so we simply don't know.
  | { kind: "unknown" };

// The list price the discount was taken from, for showing what it saves.
export function listUnitPrice(
  unitPrice: number | null,
  status: DiscountStatus | undefined
) {
  if (unitPrice == null || status?.kind !== "discount") return null;
  const factor = 1 - status.discount.percent / 100;
  return factor > 0 ? unitPrice / factor : null;
}
