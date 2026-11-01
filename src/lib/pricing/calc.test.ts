import { describe, expect, it } from "vitest";
import {
  advicePrice,
  alcoholPrice,
  margin,
  portionCost,
  portionsPerUnit,
  priceTone,
  roundPrice,
  type PricingCategoryInput,
  type PricingItemInput,
} from "./calc";

const category: PricingCategoryInput = {
  baseMargin: 0.75,
  pivotPrice: 4,
  premiumMargin: 0.5,
  wastage: 0.1,
  vatRate: 0.21,
};

const item: PricingItemInput = {
  purchasePrice: 20,
  unitVolume: 20,
  portionVolume: 0.25,
  portionsPerUnit: null,
  vatRate: null,
  alcoholPercentage: 0.05,
};

describe("portionsPerUnit", () => {
  it("follows from the volumes", () => {
    expect(portionsPerUnit(item)).toBe(80);
  });

  it("prefers a number filled in directly", () => {
    expect(portionsPerUnit({ ...item, portionsPerUnit: 24 })).toBe(24);
  });

  it("is unknown without both volumes", () => {
    expect(portionsPerUnit({ ...item, unitVolume: null })).toBeNull();
    expect(portionsPerUnit({ ...item, portionVolume: null })).toBeNull();
    expect(portionsPerUnit({ ...item, portionVolume: 0 })).toBeNull();
  });
});

describe("portionCost", () => {
  it("adds VAT and wastage to the purchase price per portion", () => {
    expect(portionCost(item, category)).toBeCloseTo((20 * 1.21) / (80 * 0.9));
  });

  it("uses the item's own VAT rate, even when that is zero", () => {
    expect(portionCost({ ...item, vatRate: 0.09 }, category)).toBeCloseTo(
      (20 * 1.09) / (80 * 0.9),
    );
    expect(portionCost({ ...item, vatRate: 0 }, category)).toBeCloseTo(
      20 / (80 * 0.9),
    );
  });

  it("is unknown without a purchase price or portions", () => {
    expect(portionCost({ ...item, purchasePrice: null }, category)).toBeNull();
    expect(portionCost({ ...item, unitVolume: null }, category)).toBeNull();
  });

  it("treats a purchase price of zero as a price", () => {
    expect(portionCost({ ...item, purchasePrice: 0 }, category)).toBe(0);
  });
});

describe("advicePrice", () => {
  it("uses the base margin below the pivot price", () => {
    expect(advicePrice(0.5, category)).toBeCloseTo(2);
  });

  it("uses the base margin right up to the pivot price", () => {
    expect(advicePrice(1, category)).toBeCloseTo(4);
  });

  it("uses the premium margin only for the cost above the pivot", () => {
    // 1 of the cost is covered by the pivot price; the other 1 at 50% is 2.
    expect(advicePrice(2, category)).toBeCloseTo(6);
  });
});

describe("roundPrice", () => {
  it("rounds to the step", () => {
    expect(roundPrice(2.34, 0.1)).toBeCloseTo(2.3);
    expect(roundPrice(2.36, 0.5)).toBeCloseTo(2.5);
  });

  it("rounds a price halfway up, despite how it divides", () => {
    expect(roundPrice(2.05, 0.1)).toBeCloseTo(2.1);
  });

  it("leaves the price alone without a step", () => {
    expect(roundPrice(2.34, 0)).toBe(2.34);
  });
});

describe("margin", () => {
  it("is the part of the sale price we keep", () => {
    expect(margin(4, 1)).toBe(0.75);
  });

  it("is negative when selling below cost", () => {
    expect(margin(1, 2)).toBe(-1);
  });
});

describe("alcoholPrice", () => {
  it("is the price of 10 ml of pure alcohol", () => {
    // 250 ml at 5% holds 12.5 ml of alcohol.
    expect(alcoholPrice(5, 0.05, 0.25)).toBeCloseTo(4);
  });

  it("is unknown without a percentage or a volume", () => {
    expect(alcoholPrice(5, null, 0.25)).toBeNull();
    expect(alcoholPrice(5, 0, 0.25)).toBeNull();
    expect(alcoholPrice(5, 0.05, null)).toBeNull();
  });
});

describe("priceTone", () => {
  it("marks prices clearly above or below the advice", () => {
    expect(priceTone(4.2, 4)).toBe("above");
    expect(priceTone(3.8, 4)).toBe("below");
  });

  it("stays neutral within the margin", () => {
    expect(priceTone(4, 4)).toBeNull();
    expect(priceTone(4.125, 4)).toBeNull();
    expect(priceTone(3.875, 4)).toBeNull();
  });

  it("stays neutral when either price is missing", () => {
    expect(priceTone(null, 4)).toBeNull();
    expect(priceTone(4, null)).toBeNull();
  });
});
