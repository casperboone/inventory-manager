import { describe, expect, it } from "vitest";
import { parseContents } from "./contents";

const NOTHING = {
  unitVolume: null,
  packVolume: null,
  count: null,
  alcoholPercentage: null,
};

describe("parseContents", () => {
  it("finds nothing without a description", () => {
    expect(parseContents(null)).toEqual(NOTHING);
    expect(parseContents("")).toEqual(NOTHING);
  });

  it("finds nothing in a description without contents", () => {
    expect(parseContents("KOFFIE DIVERSE")).toEqual(NOTHING);
  });

  it("reads a pack with a slash", () => {
    expect(parseContents("COCA COLA KRAT 24/20CL")).toEqual({
      ...NOTHING,
      count: 24,
      packVolume: 0.2,
      unitVolume: 4.8,
    });
  });

  it("reads a pack with an x and an alcohol percentage", () => {
    expect(parseContents("BIER 24X33CL 4,5%")).toEqual({
      count: 24,
      packVolume: 0.33,
      unitVolume: 7.92,
      alcoholPercentage: 0.045,
    });
  });

  it.each([
    ["FUST 20LT", 20],
    ["WHISKY 1LTR", 1],
    ["SIROOP 1,5L", 1.5],
    ["WIJN 750ML", 0.75],
    ["GIN 70CL", 0.7],
  ])("reads a single volume from %s", (description, unitVolume) => {
    expect(parseContents(description)).toEqual({ ...NOTHING, unitVolume });
  });

  it("doesn't care about case", () => {
    expect(parseContents("fust 20lt").unitVolume).toBe(20);
  });

  it("reads an alcohol percentage next to a volume", () => {
    const parsed = parseContents("PILS 5% 20LT");
    expect(parsed.alcoholPercentage).toBe(0.05);
    expect(parsed.unitVolume).toBe(20);
  });

  it("counts things that aren't poured", () => {
    expect(parseContents("CAPSULES 22ST")).toEqual({ ...NOTHING, count: 22 });
    expect(parseContents("NOTEN 20X40GR")).toEqual({ ...NOTHING, count: 20 });
  });
});
