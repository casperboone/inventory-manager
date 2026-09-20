import { z } from "zod";

const optionalString = z
  .string()
  .nullish()
  .transform((v) => (v?.trim() ? v.trim() : null));

// One row of the supplier's catalog endpoint. Only the fields we map are
// validated; everything else is kept in `raw`.
const catalogRowSchema = z.looseObject({
  Id: z.number().nullish(),
  No: z.string().trim().min(1),
  // A handful of catalog items come without description or unit.
  Description: optionalString,
  Description2: optionalString,
  SalesUnitOfMeasure: optionalString,
  UnitPrice: z.number().nullish(),
  QtyPerUnitOfMeasure: z.number().nullish(),
  IntegerOnly: z.boolean().nullish(),
  GTIN: optionalString,
  // 1 = "add to assortment" button, 2 = "remove from assortment" button.
  AssortmentAction: z.number().nullish(),
});

export type CatalogProduct = {
  itemNo: string;
  supplierId: number | null;
  description: string;
  description2: string | null;
  unitOfMeasure: string | null;
  qtyPerUnitOfMeasure: number | null;
  integerOnly: boolean;
  unitPrice: number | null;
  gtin: string | null;
  inSupplierAssortment: boolean;
  raw: Record<string, unknown>;
};

export function parseCatalogRow(row: unknown): CatalogProduct {
  const result = catalogRowSchema.safeParse(row);
  if (!result.success) {
    const no = (row as { No?: unknown } | null)?.No;
    throw new Error(
      `Invalid catalog row ${no ? `for item ${no}` : "without item number"}: ${z.prettifyError(result.error)}`
    );
  }
  const parsed = result.data;

  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || key.endsWith("Html") || key === "Thumbnail") continue;
    raw[key] = value;
  }

  return {
    itemNo: parsed.No,
    supplierId: parsed.Id ?? null,
    description: parsed.Description ?? "",
    description2: parsed.Description2,
    unitOfMeasure: parsed.SalesUnitOfMeasure,
    qtyPerUnitOfMeasure: parsed.QtyPerUnitOfMeasure ?? null,
    integerOnly: parsed.IntegerOnly ?? false,
    unitPrice: parsed.UnitPrice ?? null,
    gtin: parsed.GTIN,
    inSupplierAssortment: parsed.AssortmentAction === 2,
    raw,
  };
}
