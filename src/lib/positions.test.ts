import { describe, expect, it } from "vitest";
import { nextItemPosition, positionAfter } from "./positions";

describe("positionAfter", () => {
  it("starts an empty list at zero", () => {
    expect(positionAfter(null)).toBe(0);
  });

  it("goes after the last position", () => {
    expect(positionAfter(0)).toBe(1);
    expect(positionAfter(7)).toBe(8);
  });
});

describe("the test setup", () => {
  it("refuses to reach the database", async () => {
    await expect(nextItemPosition(1)).rejects.toThrow(
      "Tests must not touch the database.",
    );
  });
});
