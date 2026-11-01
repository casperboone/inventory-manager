import { describe, expect, it } from "vitest";
import { parseCatalogRow } from "./catalog-row";

const ROW = {
  Id: 123,
  No: "27031",
  Description: "COCA COLA (D) 12/1LTR",
  Description2: "FLES",
  SalesUnitOfMeasure: "KRAT",
  UnitPrice: 19.82,
  QtyPerUnitOfMeasure: 12,
  IntegerOnly: true,
  GTIN: "5449000000996",
  AssortmentAction: 2,
};

describe("parseCatalogRow", () => {
  it("maps the fields we use", () => {
    expect(parseCatalogRow(ROW)).toEqual({
      itemNo: "27031",
      supplierId: 123,
      description: "COCA COLA (D) 12/1LTR",
      description2: "FLES",
      unitOfMeasure: "KRAT",
      qtyPerUnitOfMeasure: 12,
      integerOnly: true,
      unitPrice: 19.82,
      gtin: "5449000000996",
      inSupplierAssortment: true,
      raw: ROW,
    });
  });

  it("fills in what the supplier leaves out", () => {
    expect(parseCatalogRow({ No: "1" })).toEqual({
      itemNo: "1",
      supplierId: null,
      description: "",
      description2: null,
      unitOfMeasure: null,
      qtyPerUnitOfMeasure: null,
      integerOnly: false,
      unitPrice: null,
      gtin: null,
      inSupplierAssortment: false,
      raw: { No: "1" },
    });
  });

  it("trims text and treats blank text as missing", () => {
    const parsed = parseCatalogRow({
      No: " 1 ",
      Description: "  COLA ",
      Description2: "   ",
      GTIN: "",
    });
    expect(parsed.itemNo).toBe("1");
    expect(parsed.description).toBe("COLA");
    expect(parsed.description2).toBeNull();
    expect(parsed.gtin).toBeNull();
  });

  it("only counts as in the assortment when it offers removal", () => {
    expect(
      parseCatalogRow({ No: "1", AssortmentAction: 1 }).inSupplierAssortment,
    ).toBe(false);
    expect(
      parseCatalogRow({ No: "1", AssortmentAction: 2 }).inSupplierAssortment,
    ).toBe(true);
  });

  it("keeps unknown fields in raw, except empty ones and markup", () => {
    const { raw } = parseCatalogRow({
      No: "1",
      Extra: "kept",
      Empty: null,
      PriceHtml: "<b>1</b>",
      Thumbnail: "base64",
    });
    expect(raw).toEqual({ No: "1", Extra: "kept" });
  });

  it("names the item when a row is invalid", () => {
    expect(() => parseCatalogRow({ No: "1", UnitPrice: "free" })).toThrow(
      "Invalid catalog row for item 1",
    );
  });

  it("says so when an invalid row has no item number", () => {
    expect(() => parseCatalogRow({ Description: "COLA" })).toThrow(
      "Invalid catalog row without item number",
    );
    expect(() => parseCatalogRow(null)).toThrow(
      "Invalid catalog row without item number",
    );
  });
});
