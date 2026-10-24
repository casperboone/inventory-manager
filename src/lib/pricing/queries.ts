import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItemImages,
  assortmentItems,
  pricingCategories,
  pricingSettings,
  salePriceChanges,
  supplierProducts,
  type PricingCategory,
  type PricingSettings,
} from "@/db/schema";
import {
  advicePrice,
  alcoholPrice,
  margin,
  portionCost,
  portionsPerUnit,
  roundPrice,
} from "./calc";
import { getQuantitiesByYear } from "@/lib/products/purchases";

export const DEFAULT_SETTINGS: PricingSettings = {
  id: 1,
  priceRounding: 0.1,
  adviceTolerance: 0.1,
  alcoholReferenceItemId: null,
};

export async function getPricingSettings(): Promise<PricingSettings> {
  const row = await db.query.pricingSettings.findFirst({
    where: eq(pricingSettings.id, 1),
  });
  return row ?? DEFAULT_SETTINGS;
}

export async function getPricingCategories() {
  return db
    .select()
    .from(pricingCategories)
    .orderBy(asc(pricingCategories.position), asc(pricingCategories.id));
}

export type MissingField =
  "category" | "purchasePrice" | "portions" | "salePrice";

export type PricingRow = {
  id: number;
  name: string;
  orderCategoryId: number;
  orderCategoryName: string;
  pricingCategoryId: number | null;
  notForSale: boolean;
  itemNo: string | null;
  supplierDescription: string | null;
  supplierRemoved: boolean;
  imageStatus: "available" | "none" | null;
  hasOwnImage: boolean;
  unitOfMeasure: string | null;
  catalogPrice: number | null;
  manualPurchasePrice: number | null;
  purchaseSource: string | null;
  unitVolume: number | null;
  portionVolume: number | null;
  portionsPerUnitOverride: number | null;
  alcoholPercentage: number | null;
  vatRateOverride: number | null;
  salePrice: number | null;
  salePriceCost: number | null;

  // Derived.
  purchasePrice: number | null;
  vatRate: number | null;
  portions: number | null;
  cost: number | null;
  advice: number | null;
  adviceRounded: number | null;
  margin: number | null;
  profit: number | null;
  alcoholPrice: number | null;
  // Bought according to the invoices, in purchase units and in portions.
  bought: {
    thisYear: { units: number; portions: number | null } | null;
    lastYear: { units: number; portions: number | null } | null;
  };
  signals: {
    missing: MissingField[];
    adviceDiffers: boolean;
    lowMargin: boolean;
    costChanged: boolean;
    cheapAlcohol: boolean;
  };
};

export type PricingOverview = {
  rows: PricingRow[];
  // The years the "bought" columns cover; this one only up to today.
  years: { thisYear: string; lastYear: string };
  categories: PricingCategory[];
  settings: PricingSettings;
  reference: { id: number; name: string; alcoholPrice: number | null } | null;
};

export async function getPricingOverview(): Promise<PricingOverview> {
  const [items, categories, settings] = await Promise.all([
    db
      .select({
        id: assortmentItems.id,
        name: assortmentItems.name,
        orderCategoryId: assortmentItems.categoryId,
        orderCategoryName: assortmentCategories.name,
        pricingCategoryId: assortmentItems.pricingCategoryId,
        notForSale: assortmentItems.notForSale,
        itemNo: supplierProducts.itemNo,
        supplierDescription: supplierProducts.description,
        removedAt: supplierProducts.removedAt,
        imageStatus: supplierProducts.imageStatus,
        ownImageId: assortmentItemImages.itemId,
        unitOfMeasure: supplierProducts.unitOfMeasure,
        catalogPrice: supplierProducts.unitPrice,
        manualPurchasePrice: assortmentItems.manualPurchasePrice,
        purchaseSource: assortmentItems.purchaseSource,
        unitVolume: assortmentItems.unitVolume,
        portionVolume: assortmentItems.portionVolume,
        portionsPerUnitOverride: assortmentItems.portionsPerUnit,
        alcoholPercentage: assortmentItems.alcoholPercentage,
        vatRateOverride: assortmentItems.vatRate,
        salePrice: assortmentItems.salePrice,
        salePriceCost: assortmentItems.salePriceCost,
      })
      .from(assortmentItems)
      .innerJoin(
        assortmentCategories,
        eq(assortmentItems.categoryId, assortmentCategories.id),
      )
      .leftJoin(
        supplierProducts,
        eq(assortmentItems.supplierProductId, supplierProducts.id),
      )
      .leftJoin(
        assortmentItemImages,
        eq(assortmentItemImages.itemId, assortmentItems.id),
      )
      .where(
        and(
          eq(assortmentItems.kind, "product"),
          isNull(assortmentItems.archivedAt),
        ),
      )
      .orderBy(
        asc(assortmentCategories.position),
        asc(assortmentItems.position),
        asc(assortmentItems.id),
      ),
    getPricingCategories(),
    getPricingSettings(),
  ]);

  // Calendar years as the invoice dates are stored, like purchase history.
  const thisYear = String(new Date().getUTCFullYear());
  const lastYear = String(Number(thisYear) - 1);
  const quantities = await getQuantitiesByYear([thisYear, lastYear]);

  const byId = new Map(categories.map((category) => [category.id, category]));

  const rows: PricingRow[] = items.map(({ removedAt, ownImageId, ...item }) => {
    const category = item.pricingCategoryId
      ? byId.get(item.pricingCategoryId)
      : undefined;
    const purchasePrice = item.manualPurchasePrice ?? item.catalogPrice;
    const input = {
      purchasePrice,
      unitVolume: item.unitVolume,
      portionVolume: item.portionVolume,
      portionsPerUnit: item.portionsPerUnitOverride,
      vatRate: item.vatRateOverride,
      alcoholPercentage: item.alcoholPercentage,
    };
    const portions = portionsPerUnit(input);
    const cost = category ? portionCost(input, category) : null;
    const advice =
      category && cost != null ? advicePrice(cost, category) : null;
    const adviceRounded =
      advice != null ? roundPrice(advice, settings.priceRounding) : null;
    const sale = item.salePrice;

    const missing: MissingField[] = [];
    if (!category) missing.push("category");
    if (purchasePrice == null) missing.push("purchasePrice");
    if (!portions) missing.push("portions");
    if (sale == null) missing.push("salePrice");

    const boughtIn = (year: string) => {
      // Linked but never invoiced is a real zero; unlinked is unknown.
      const units = item.itemNo
        ? (quantities.get(item.itemNo)?.get(year) ?? 0)
        : undefined;
      if (units == null) return null;
      return { units, portions: portions ? units * portions : null };
    };

    const rowMargin = sale && cost != null ? margin(sale, cost) : null;

    return {
      ...item,
      supplierRemoved: removedAt !== null,
      hasOwnImage: ownImageId !== null,
      purchasePrice,
      vatRate: item.vatRateOverride ?? category?.vatRate ?? null,
      portions,
      cost,
      advice,
      adviceRounded,
      margin: rowMargin,
      profit: sale != null && cost != null ? sale - cost : null,
      alcoholPrice:
        sale != null
          ? alcoholPrice(sale, item.alcoholPercentage, item.portionVolume)
          : null,
      bought: { thisYear: boughtIn(thisYear), lastYear: boughtIn(lastYear) },
      signals: {
        missing,
        adviceDiffers:
          sale != null &&
          adviceRounded != null &&
          Math.abs(sale - adviceRounded) >
            adviceRounded * settings.adviceTolerance + 0.001,
        // The blended margin never drops below the premium margin, so
        // anything under it is priced below what the model allows.
        lowMargin:
          rowMargin != null && !!category && rowMargin < category.premiumMargin,
        costChanged:
          cost != null &&
          item.salePriceCost != null &&
          Math.abs(cost - item.salePriceCost) >= 0.005,
        cheapAlcohol: false,
      },
    };
  });

  const referenceRow = settings.alcoholReferenceItemId
    ? rows.find((row) => row.id === settings.alcoholReferenceItemId)
    : undefined;
  const reference = referenceRow
    ? {
        id: referenceRow.id,
        name: referenceRow.name,
        alcoholPrice: referenceRow.alcoholPrice,
      }
    : null;
  if (reference?.alcoholPrice != null) {
    for (const row of rows) {
      row.signals.cheapAlcohol =
        row.id !== reference.id &&
        row.alcoholPrice != null &&
        row.alcoholPrice < reference.alcoholPrice - 0.005;
    }
  }

  return {
    rows,
    years: { thisYear, lastYear },
    categories,
    settings,
    reference,
  };
}

export async function getSalePriceHistory(itemId: number) {
  return db
    .select()
    .from(salePriceChanges)
    .where(eq(salePriceChanges.itemId, itemId))
    .orderBy(desc(salePriceChanges.createdAt), desc(salePriceChanges.id));
}
