// The pricing model from the bar's old "Prijsberekening" sheet, as pure
// functions so the page, the actions and the import script agree.
//
// The margin works like tax brackets: the cost up to the pivot price is marked
// up with the base margin, and only the part above it with the (lower) premium
// margin. Cheap drinks get the full margin, expensive ones stay affordable but
// still earn more per glass.

export type PricingCategoryInput = {
  baseMargin: number;
  pivotPrice: number;
  premiumMargin: number;
  wastage: number;
  vatRate: number;
};

export type PricingItemInput = {
  // Per purchase unit, excluding VAT.
  purchasePrice: number | null;
  unitVolume: number | null;
  portionVolume: number | null;
  portionsPerUnit: number | null;
  vatRate: number | null;
  alcoholPercentage: number | null;
};

export function portionsPerUnit(item: PricingItemInput) {
  if (item.portionsPerUnit) return item.portionsPerUnit;
  if (item.unitVolume && item.portionVolume) {
    return item.unitVolume / item.portionVolume;
  }
  return null;
}

// What one sellable portion costs us, including VAT and wastage.
export function portionCost(
  item: PricingItemInput,
  category: PricingCategoryInput,
) {
  const portions = portionsPerUnit(item);
  if (item.purchasePrice == null || !portions) return null;
  const vat = item.vatRate ?? category.vatRate;
  return (item.purchasePrice * (1 + vat)) / (portions * (1 - category.wastage));
}

export function advicePrice(cost: number, category: PricingCategoryInput) {
  const atBaseMargin = cost / (1 - category.baseMargin);
  if (atBaseMargin <= category.pivotPrice) return atBaseMargin;
  // The cost above what the pivot price covers at the base margin.
  const costAbovePivot =
    (atBaseMargin - category.pivotPrice) * (1 - category.baseMargin);
  return category.pivotPrice + costAbovePivot / (1 - category.premiumMargin);
}

export function roundPrice(price: number, rounding: number) {
  if (!rounding) return price;
  // Rounding the quotient first keeps 2.05 / 0.1 from landing on 20.499….
  return Math.round(Number((price / rounding).toFixed(6))) * rounding;
}

export function margin(salePrice: number, cost: number) {
  return (salePrice - cost) / salePrice;
}

// Price of 10 ml of pure alcohol, to compare drinks of different strengths.
export function alcoholPrice(
  salePrice: number,
  alcoholPercentage: number | null,
  portionVolume: number | null,
) {
  if (!alcoholPercentage || !portionVolume) return null;
  return salePrice / ((alcoholPercentage * portionVolume) / 0.01);
}

// As in the old sheet: green when the price is clearly above the unrounded
// advice, red when it is clearly below, and no colour within the margin.
const PRICE_TONE_MARGIN = 0.125;

export function priceTone(salePrice: number | null, advice: number | null) {
  if (salePrice == null || advice == null) return null;
  if (salePrice > advice + PRICE_TONE_MARGIN) return "above" as const;
  if (salePrice < advice - PRICE_TONE_MARGIN) return "below" as const;
  return null;
}
