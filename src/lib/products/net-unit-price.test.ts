import { describe, expect, it } from "vitest";
import { netUnitPrice } from "./net-unit-price";

describe("netUnitPrice", () => {
  it("divides what the line came to by the quantity", () => {
    expect(netUnitPrice(4, 79.28)).toBeCloseTo(19.82);
  });

  it("has no price for a return", () => {
    expect(netUnitPrice(-3, -59.46)).toBeNull();
  });

  it("has no price without a quantity", () => {
    expect(netUnitPrice(0, 0)).toBeNull();
    expect(netUnitPrice(null, 10)).toBeNull();
  });

  it("has no price without an amount", () => {
    expect(netUnitPrice(2, null)).toBeNull();
  });

  it("prices free goods at zero", () => {
    expect(netUnitPrice(2, 0)).toBe(0);
  });
});
