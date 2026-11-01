import { formatPrice } from "@/lib/format";
import { priceTone } from "./calc";
import type { MissingField, PricingRow } from "./queries";

const MISSING_LABELS: Record<MissingField, string> = {
  category: "pricing category",
  purchasePrice: "purchase price",
  portions: "portions",
  salePrice: "sale price",
};

export type SignalChip = {
  key: string;
  label: string;
  detail: string;
  tone: "warn" | "bad";
};

// What the pricing model has to say about an item, in words.
export function signalChips(
  row: PricingRow,
  reference: { name?: string; alcoholPrice: number | null },
): SignalChip[] {
  const { signals } = row;
  const chips: SignalChip[] = [];

  if (row.supplierRemoved) {
    chips.push({
      key: "removed",
      label: "Gone from catalog",
      detail:
        row.manualPurchasePrice != null
          ? "Rust no longer lists this product. The cost uses the manual purchase price."
          : `Rust no longer lists this product. The cost still uses its last catalog price of ${formatPrice(row.catalogPrice)}.`,
      tone: "bad",
    });
  }
  if (signals.missing.length > 0) {
    chips.push({
      key: "missing",
      label: "Missing data",
      detail: `No ${signals.missing.map((field) => MISSING_LABELS[field]).join(", ")} yet.`,
      tone: "warn",
    });
  }
  if (signals.lowMargin) {
    chips.push({
      key: "margin",
      label: "Low margin",
      detail: "The margin is below the category's premium margin.",
      tone: "bad",
    });
  }
  if (
    signals.belowAdvice &&
    row.salePrice != null &&
    row.adviceRounded != null
  ) {
    chips.push({
      key: "advice",
      label: `−${formatPrice(row.adviceRounded - row.salePrice)} vs advice`,
      detail: `Advice is ${formatPrice(row.adviceRounded)}.`,
      tone: "warn",
    });
  }
  if (signals.costChanged && row.cost != null && row.salePriceCost != null) {
    const diff = row.cost - row.salePriceCost;
    chips.push({
      key: "cost",
      label: `Cost ${diff > 0 ? "up" : "down"} ${formatPrice(Math.abs(diff))}`,
      detail: `A portion cost ${formatPrice(row.salePriceCost)} when the price was set, now ${formatPrice(row.cost)}. Save the price again to accept.`,
      tone: diff > 0 ? "bad" : "warn",
    });
  }
  if (signals.cheapAlcohol) {
    chips.push({
      key: "alcohol",
      label: "Cheap alcohol",
      detail: `10 ml of alcohol costs ${formatPrice(row.alcoholPrice)}, less than ${reference.name} (${formatPrice(reference.alcoholPrice)}).`,
      tone: "warn",
    });
  }
  return chips;
}

// How a sale price compares to the unrounded advice, for showing it coloured.
export function priceToneStyle(
  salePrice: number | null,
  advice: number | null,
) {
  const tone = priceTone(salePrice, advice);
  if (tone === "above") {
    return {
      title: "Above the advice",
      className: "border-green-600/30 bg-green-100 dark:bg-green-500/20",
    };
  }
  if (tone === "below") {
    return {
      title: "Below the advice",
      className: "border-red-600/30 bg-red-100 dark:bg-red-500/20",
    };
  }
  return null;
}
