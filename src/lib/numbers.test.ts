import { describe, expect, it } from "vitest";
import { parseTypedNumber } from "./numbers";

describe("parseTypedNumber", () => {
  it("reads a dot or a comma as the decimal separator", () => {
    expect(parseTypedNumber("2.5")).toBe(2.5);
    expect(parseTypedNumber("2,5")).toBe(2.5);
  });

  it("ignores whitespace around the number", () => {
    expect(parseTypedNumber("  12 ")).toBe(12);
  });

  it("keeps zero and negative numbers", () => {
    expect(parseTypedNumber("0")).toBe(0);
    expect(parseTypedNumber("-1,5")).toBe(-1.5);
  });

  it("gives null for an empty field", () => {
    expect(parseTypedNumber("")).toBeNull();
    expect(parseTypedNumber("   ")).toBeNull();
  });

  it("gives null for anything that isn't a number", () => {
    expect(parseTypedNumber("abc")).toBeNull();
    expect(parseTypedNumber("1,5,5")).toBeNull();
    expect(parseTypedNumber("Infinity")).toBeNull();
  });
});
