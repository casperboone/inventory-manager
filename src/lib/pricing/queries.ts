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

// What the pricing screen and an item's own page work from; they differ in
// which items they ask for.
function selectPricingItems() {
  return db
    .select({
      id: assortmentItems.id,
      name: assortmentItems.name,
      orderCategoryId: assortmentItems.categoryId,
      orderCategoryName: assortmentCategories.name,
      pricingCategoryId: assortmentItems.pricingCategoryId,
      notForSale: assortmentItems.notForSale,
      archivedAt: assortmentItems.archivedAt,
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
    );
}

const ACTIVE_PRODUCT = and(
  eq(assortmentItems.kind, "product"),
  isNull(assortmentItems.archivedAt),
);

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
  archivedAt: Date | null;
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
    belowAdvice: boolean;
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

// Calendar years as the invoice dates are stored, like purchase history.
function boughtYears() {
  const thisYear = String(new Date().getUTCFullYear());
  return { thisYear, lastYear: String(Number(thisYear) - 1) };
}

function toPricingRow(
  { removedAt, ownImageId, ...item }: Awaited<
    ReturnType<typeof selectPricingItems>
  >[number],
  context: {
    category: PricingCategory | undefined;
    settings: PricingSettings;
    quantities: Awaited<ReturnType<typeof getQuantitiesByYear>>;
    years: PricingOverview["years"];
  },
): PricingRow {
  const { category, settings, quantities, years } = context;
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
  const advice = category && cost != null ? advicePrice(cost, category) : null;
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
    bought: {
      thisYear: boughtIn(years.thisYear),
      lastYear: boughtIn(years.lastYear),
    },
    signals: {
      missing,
      // Charging more than the advice is fine; only less gets flagged.
      belowAdvice:
        sale != null &&
        adviceRounded != null &&
        adviceRounded - sale > adviceRounded * settings.adviceTolerance + 0.001,
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
}

function isCheapAlcohol(
  row: PricingRow,
  reference: NonNullable<PricingOverview["reference"]>,
) {
  return (
    reference.alcoholPrice != null &&
    row.id !== reference.id &&
    row.alcoholPrice != null &&
    row.alcoholPrice < reference.alcoholPrice - 0.005
  );
}

export async function getPricingOverview(): Promise<PricingOverview> {
  const [items, categories, settings] = await Promise.all([
    selectPricingItems()
      .where(ACTIVE_PRODUCT)
      .orderBy(
        asc(assortmentCategories.position),
        asc(assortmentItems.position),
        asc(assortmentItems.id),
      ),
    getPricingCategories(),
    getPricingSettings(),
  ]);

  const years = boughtYears();
  const quantities = await getQuantitiesByYear([
    years.thisYear,
    years.lastYear,
  ]);

  const byId = new Map(categories.map((category) => [category.id, category]));

  const rows = items.map((item) =>
    toPricingRow(item, {
      category: item.pricingCategoryId
        ? byId.get(item.pricingCategoryId)
        : undefined,
      settings,
      quantities,
      years,
    }),
  );

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
  if (reference) {
    for (const row of rows) {
      row.signals.cheapAlcohol = isCheapAlcohol(row, reference);
    }
  }

  return { rows, years, categories, settings, reference };
}

export type PricingItem = {
  row: PricingRow;
  category: PricingCategory | null;
  years: PricingOverview["years"];
  reference: PricingOverview["reference"];
};

// One item's row, worked out exactly like the overview does. Unlike the
// overview it also finds archived items, which still have a page of their own.
export async function getPricingItem(
  itemId: number,
): Promise<PricingItem | null> {
  const [[item], categories, settings] = await Promise.all([
    selectPricingItems()
      .where(
        and(eq(assortmentItems.id, itemId), eq(assortmentItems.kind, "product")),
      )
      .limit(1),
    getPricingCategories(),
    getPricingSettings(),
  ]);
  if (!item) return null;

  const years = boughtYears();
  const [quantities, [referenceItem]] = await Promise.all([
    item.itemNo
      ? getQuantitiesByYear([years.thisYear, years.lastYear], [item.itemNo])
      : new Map<string, Map<string, number>>(),
    settings.alcoholReferenceItemId
      ? selectPricingItems()
          .where(
            and(
              eq(assortmentItems.id, settings.alcoholReferenceItemId),
              ACTIVE_PRODUCT,
            ),
          )
          .limit(1)
      : [],
  ]);

  const categoryOf = (id: number | null) =>
    categories.find((category) => category.id === id);
  const context = { settings, quantities, years };
  const category = categoryOf(item.pricingCategoryId);
  const row = toPricingRow(item, { ...context, category });

  const referenceRow =
    referenceItem &&
    toPricingRow(referenceItem, {
      ...context,
      category: categoryOf(referenceItem.pricingCategoryId),
    });
  const reference = referenceRow
    ? {
        id: referenceRow.id,
        name: referenceRow.name,
        alcoholPrice: referenceRow.alcoholPrice,
      }
    : null;
  if (reference) row.signals.cheapAlcohol = isCheapAlcohol(row, reference);

  return { row, category: category ?? null, years, reference };
}

export async function getSalePriceHistory(itemId: number) {
  return db
    .select()
    .from(salePriceChanges)
    .where(eq(salePriceChanges.itemId, itemId))
    .orderBy(desc(salePriceChanges.createdAt), desc(salePriceChanges.id));
}
