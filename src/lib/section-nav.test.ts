import { describe, expect, it } from "vitest";
import { findActiveHref } from "./section-nav";

const HREFS = ["/orders", "/orders/not-delivered"];

describe("findActiveHref", () => {
  it("finds the page itself", () => {
    expect(findActiveHref("/orders", HREFS)).toBe("/orders");
  });

  it("prefers the longest match when one link starts another", () => {
    expect(findActiveHref("/orders/not-delivered", HREFS)).toBe(
      "/orders/not-delivered",
    );
  });

  it("keeps a section lit on the pages below it", () => {
    expect(findActiveHref("/orders/12", HREFS)).toBe("/orders");
  });

  it("only matches whole path segments", () => {
    expect(findActiveHref("/orders-archive", HREFS)).toBeUndefined();
  });

  it("finds nothing outside the section", () => {
    expect(findActiveHref("/pricing", HREFS)).toBeUndefined();
  });
});
