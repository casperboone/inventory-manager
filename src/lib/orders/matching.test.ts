import { describe, expect, it } from "vitest";
import {
  computeProgress,
  isNonProductLine,
  suggestDocuments,
  suggestSubstitutes,
  type ProgressLine,
  type RustDocument,
} from "./matching";
import { orderLabel, orderReference, parseOrderReference } from "./reference";

const SENT = new Date("2026-11-02T10:00:00Z");
const NOW = new Date("2026-11-05T10:00:00Z");

function line(id: number, itemNo: string | null, quantity: number, extra: Partial<ProgressLine> = {}): ProgressLine {
  return {
    id,
    name: `Line ${id}`,
    itemNo,
    quantity,
    sentQuantity: quantity,
    receivedQuantity: 0,
    resolution: null,
    substituteItemNo: null,
    ...extra,
  };
}

function doc(documentNo: string, type: RustDocument["type"], lines: [string, number, string?][], extra: Partial<RustDocument> = {}): RustDocument {
  return {
    documentNo,
    type,
    date: new Date("2026-11-03T00:00:00Z"),
    reference: null,
    lines: lines.map(([itemNo, quantity, description]) => ({
      itemNo,
      quantity,
      description: description ?? `PRODUCT ${itemNo}`,
    })),
    ...extra,
  };
}

const progressOf = (lines: ProgressLine[], documents: RustDocument[], now = NOW) =>
  computeProgress(lines, documents, SENT, now);

describe("order references", () => {
  it("round-trips and tolerates how it was typed", () => {
    expect(orderReference(42)).toBe("IM-42");
    expect(parseOrderReference("IM-42")).toBe(42);
    expect(parseOrderReference(" im-42 kerst ")).toBe(42);
    expect(parseOrderReference("TIM-42")).toBeNull();
    expect(parseOrderReference("")).toBeNull();
    expect(parseOrderReference(null)).toBeNull();
  });

  it("falls back on the number for an order without a name", () => {
    expect(orderLabel({ id: 3, name: null })).toBe("Order 3");
    expect(orderLabel({ id: 3, name: "  " })).toBe("Order 3");
    expect(orderLabel({ id: 3, name: "Kerst" })).toBe("Kerst");
  });
});

describe("isNonProductLine", () => {
  it.each([
    ["8891", "EMBALLAGE EURO 5,00"],
    ["8820", "EMBALLAGE KOOLZUUR EURO 120,00"],
    ["8", "BRANDSTOFTOESLAG"],
    ["DIVERSE", "CORRECTIE VFC22-2107"],
  ])("leaves out %s %s", (itemNo, description) => {
    expect(isNonProductLine({ itemNo, description })).toBe(true);
  });

  it("keeps products, koolzuur included", () => {
    expect(isNonProductLine({ itemNo: "7201", description: "KOOLZUUR 120,00 ACP 10KG" })).toBe(false);
    expect(isNonProductLine({ itemNo: "19", description: null })).toBe(false);
  });
});

describe("computeProgress", () => {
  it("is in the cart until Rust shows something", () => {
    const result = progressOf([line(1, "19", 2)], []);
    expect(result.stage).toBe("in_cart");
    expect(result.lines[0].status).toBe("waiting");
  });

  it("flags an order with no invoice after 14 days, not before", () => {
    const lines = [line(1, "19", 2)];
    expect(progressOf(lines, [], new Date("2026-11-16T10:00:00Z")).overdue).toBe(false);
    expect(progressOf(lines, [], new Date("2026-11-16T10:00:01Z")).overdue).toBe(true);
    const invoiced = [doc("VFC1", "invoice", [["19", 1]])];
    expect(progressOf(lines, invoiced, new Date("2026-12-30T10:00:00Z")).overdue).toBe(false);
  });

  it("waits while the Rust order is open, even with everything still to come", () => {
    const result = progressOf(
      [line(1, "19", 2), line(2, "957", 1)],
      [doc("WEB1", "order", [["19", 2]])]
    );
    expect(result.stage).toBe("placed");
    expect(result.settled).toBe(false);
    expect(result.lines[0]).toMatchObject({ status: "waiting", onRustOrder: 2 });
    // Not on the Rust order, but it could be split off: not called missing yet.
    expect(result.lines[1]).toMatchObject({ status: "waiting", onRustOrder: 0 });
  });

  it("calls it missing once invoiced and off the open list", () => {
    const result = progressOf(
      [line(1, "19", 2), line(2, "957", 1)],
      [
        doc("WEB1", "order", [["19", 2], ["957", 1]], { leftOpenList: true }),
        doc("VFC1", "invoice", [["19", 2]], { orderNo: "WEB1" }),
      ]
    );
    expect(result.stage).toBe("invoiced");
    expect(result.lines[0].status).toBe("delivered");
    expect(result.lines[1]).toMatchObject({ status: "missing", shortBy: 1 });
    expect(result.shortCount).toBe(1);
  });

  it("doesn't call anything missing while an invoiced order is still open", () => {
    const result = progressOf(
      [line(1, "19", 2)],
      [
        doc("WEB1", "order", [["19", 2]], { leftOpenList: false }),
        doc("VFC1", "invoice", [["19", 1]], { orderNo: "WEB1" }),
      ]
    );
    expect(result.stage).toBe("partly_invoiced");
    expect(result.lines[0]).toMatchObject({ status: "waiting", got: 1 });
  });

  it("isn't settled while one of two Rust orders has no invoice yet", () => {
    const result = progressOf(
      [line(1, "19", 2), line(2, "957", 1)],
      [
        doc("WEB1", "order", [["19", 2]], { leftOpenList: true }),
        doc("WEB2", "order", [["957", 1]], { leftOpenList: true }),
        doc("VFC1", "invoice", [["19", 2]], { orderNo: "WEB1" }),
      ]
    );
    expect(result.settled).toBe(false);
    expect(result.lines[1].status).toBe("waiting");
  });

  it("settles on an invoice that doesn't name its order", () => {
    const result = progressOf(
      [line(1, "19", 2)],
      [
        doc("WEB1", "order", [["19", 2]], { leftOpenList: true }),
        doc("VFC1", "invoice", [["19", 1]], { orderNo: null }),
      ]
    );
    expect(result.settled).toBe(true);
    expect(result.lines[0]).toMatchObject({ status: "short", got: 1, shortBy: 1 });
  });

  it("settles on an invoice linked without any Rust order", () => {
    const result = progressOf(
      [line(1, "19", 2)],
      [doc("VFC1", "invoice", [["19", 2]])]
    );
    expect(result.stage).toBe("complete");
  });

  it("adds up a split over two invoices", () => {
    const result = progressOf(
      [line(1, "19", 3)],
      [
        doc("VFC1", "invoice", [["19", 2]]),
        doc("VFC2", "invoice", [["19", 1]]),
      ]
    );
    expect(result.lines[0]).toMatchObject({ status: "delivered", got: 3 });
  });

  it("doesn't count deposits or the surcharge as products", () => {
    const result = progressOf(
      [line(1, "19", 1)],
      [
        doc("VFC1", "invoice", [
          ["19", 1, "HORECABIER FUST 20LT"],
          ["8856", 1, "EMBALLAGE EURO 30,00"],
          ["8856", -2, "EMBALLAGE EURO 30,00"],
          ["8", 1, "BRANDSTOFTOESLAG"],
        ]),
      ]
    );
    expect(result.stage).toBe("complete");
    expect(result.extras).toEqual([]);
    expect(result.returns).toEqual([]);
  });

  it("shares a product between two lines, shortage on the last", () => {
    const result = progressOf(
      [line(1, "19", 3), line(2, "19", 2)],
      [doc("VFC1", "invoice", [["19", 4]])]
    );
    expect(result.lines[0]).toMatchObject({ status: "delivered", got: 3 });
    expect(result.lines[1]).toMatchObject({ status: "short", got: 1, shortBy: 1 });
  });

  it("holds a credit note against the amounts", () => {
    const result = progressOf(
      [line(1, "19", 2)],
      [
        doc("VFC1", "invoice", [["19", 2]]),
        doc("VFC2", "creditmemo", [["19", 1]]),
      ]
    );
    expect(result.lines[0]).toMatchObject({ status: "short", got: 1, shortBy: 1 });
  });

  it("doesn't go below zero on a credit note for more than was invoiced", () => {
    const result = progressOf(
      [line(1, "19", 2)],
      [
        doc("VFC1", "invoice", [["19", 1]]),
        doc("VFC2", "creditmemo", [["19", 3]]),
      ]
    );
    expect(result.lines[0]).toMatchObject({ status: "missing", got: 0, shortBy: 2 });
  });

  it("keeps returns on an invoice apart from the amounts", () => {
    const result = progressOf(
      [line(1, "810", 2)],
      [doc("VFC1", "invoice", [["810", 2], ["810", -1], ["27031", -3]])]
    );
    expect(result.lines[0].status).toBe("delivered");
    expect(result.returns.map((row) => [row.itemNo, row.quantity])).toEqual([
      ["810", -1],
      ["27031", -3],
    ]);
  });

  it("shows what was bought directly at Rust as extra", () => {
    const result = progressOf(
      [line(1, "19", 1)],
      [doc("VFC1", "invoice", [["19", 1], ["16346", 2, "TORK HANDDOEK"]])]
    );
    expect(result.stage).toBe("complete");
    expect(result.extras).toEqual([
      { itemNo: "16346", description: "TORK HANDDOEK", quantity: 2 },
    ]);
  });

  it("marks too much on the line it belongs to", () => {
    const result = progressOf(
      [line(1, "19", 1)],
      [doc("VFC1", "invoice", [["19", 3]])]
    );
    expect(result.lines[0]).toMatchObject({ status: "delivered", overBy: 2 });
    expect(result.extras).toEqual([]);
  });

  it("lets a confirmed replacement cover a line", () => {
    const lines = [
      line(1, "957", 2, { resolution: "substituted", substituteItemNo: "958" }),
    ];
    const result = progressOf(lines, [doc("VFC1", "invoice", [["958", 2]])]);
    expect(result.lines[0]).toMatchObject({ status: "substituted", got: 2 });
    expect(result.extras).toEqual([]);
    expect(result.stage).toBe("complete");
  });

  it("gives a replacement only what the product's own line leaves", () => {
    const lines = [
      line(1, "958", 1),
      line(2, "957", 2, { resolution: "substituted", substituteItemNo: "958" }),
    ];
    const result = progressOf(lines, [doc("VFC1", "invoice", [["958", 2]])]);
    expect(result.lines[0]).toMatchObject({ status: "delivered", got: 1 });
    expect(result.lines[1]).toMatchObject({ got: 1, shortBy: 1 });
  });

  it("leaves free text and unlinked items to be ticked off", () => {
    const result = progressOf(
      [line(1, null, 2), line(2, null, 1, { receivedQuantity: 1 })],
      [doc("VFC1", "invoice", [])]
    );
    expect(result.lines[0]).toMatchObject({ status: "by_hand", shortBy: 2 });
    expect(result.lines[1].status).toBe("delivered");
    expect(result.toTickCount).toBe(1);
    expect(result.shortCount).toBe(0);
  });

  it("counts what's ticked off on top of the invoices", () => {
    const result = progressOf(
      [line(1, "19", 2, { receivedQuantity: 1 })],
      [doc("VFC1", "invoice", [["19", 1]])]
    );
    expect(result.lines[0]).toMatchObject({ status: "delivered", got: 2 });
  });

  it("stops holding an accepted shortage against the order", () => {
    const result = progressOf(
      [line(1, "19", 2, { resolution: "accepted" })],
      [doc("VFC1", "invoice", [["19", 1]])]
    );
    expect(result.lines[0].status).toBe("accepted");
    expect(result.stage).toBe("complete");
    expect(result.shortCount).toBe(0);
  });

  it("keeps a line the cart refused apart from one that's coming", () => {
    const result = progressOf([line(1, "7777", 1, { sentQuantity: 0 })], []);
    expect(result.lines[0].status).toBe("not_sent");
  });

  it("still finds a refused line when it was added at Rust by hand", () => {
    const result = progressOf(
      [line(1, "7777", 1, { sentQuantity: 0 })],
      [doc("VFC1", "invoice", [["7777", 1]])]
    );
    expect(result.lines[0].status).toBe("delivered");
  });

  it("isn't complete with nothing on it", () => {
    expect(progressOf([], []).stage).toBe("in_cart");
  });

  it("copes with a line without a quantity", () => {
    const document = doc("VFC1", "invoice", [["19", 1]]);
    document.lines.push({ itemNo: "19", description: "X", quantity: null });
    expect(progressOf([line(1, "19", 1)], [document]).stage).toBe("complete");
  });
});

describe("suggestDocuments", () => {
  const order = { id: 7, sentAt: SENT };
  const suggest = (
    lines: ProgressLine[],
    linked: RustDocument[],
    candidates: RustDocument[]
  ) =>
    suggestDocuments(order, lines, progressOf(lines, linked).lines, candidates);

  const twoLines = [line(1, "19", 2), line(2, "957", 1)];

  it("is sure about a Rust order with the same products", () => {
    const [suggestion] = suggest(twoLines, [], [
      doc("WEB1", "order", [["19", 2], ["957", 1], ["8856", 2, "EMBALLAGE EURO 30,00"]]),
    ]);
    expect(suggestion).toMatchObject({ documentNo: "WEB1", confidence: "high", matched: 2, score: 1 });
  });

  it("isn't thrown by deposits on the document", () => {
    const [suggestion] = suggest([line(1, "19", 1)], [], [
      doc("WEB1", "order", [["19", 1], ["8856", 1, "EMBALLAGE EURO 30,00"], ["8", 1, "BRANDSTOFTOESLAG"]]),
    ]);
    expect(suggestion.score).toBe(1);
  });

  it("leaves out what shares nothing, or is too old or too new", () => {
    expect(suggest(twoLines, [], [doc("WEB1", "order", [["501", 1]])])).toEqual([]);
    expect(
      suggest(twoLines, [], [
        doc("WEB1", "order", [["19", 2]], { date: new Date("2026-10-30T00:00:00Z") }),
      ])
    ).toEqual([]);
    expect(
      suggest(twoLines, [], [
        doc("WEB1", "order", [["19", 2]], { date: new Date("2026-11-20T00:00:00Z") }),
      ])
    ).toEqual([]);
  });

  it("lets an invoice come weeks later than an order could", () => {
    const [suggestion] = suggest(twoLines, [], [
      doc("VFC1", "invoice", [["19", 2], ["957", 1]], { date: new Date("2026-12-10T00:00:00Z") }),
    ]);
    expect(suggestion.documentNo).toBe("VFC1");
  });

  it("tolerates a day of difference in the portal's dates", () => {
    const result = suggest(twoLines, [], [
      doc("WEB1", "order", [["19", 2], ["957", 1]], { date: new Date("2026-11-01T12:00:00Z") }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("skips a document that carries another order's reference", () => {
    expect(
      suggest(twoLines, [], [
        doc("WEB1", "order", [["19", 2], ["957", 1]], { reference: "IM-8" }),
      ])
    ).toEqual([]);
  });

  it("doesn't offer a big order that shares one thing with ours", () => {
    const big = Array.from({ length: 20 }, (_, i): [string, number] => [`9${i}`, 1]);
    expect(suggest(twoLines, [], [doc("WEB1", "order", [["19", 1], ...big])])).toEqual([]);
  });

  it("scores a second Rust order on what the first left open", () => {
    const linked = [doc("WEB1", "order", [["19", 2]])];
    const [suggestion] = suggest(twoLines, linked, [doc("WEB2", "order", [["957", 1]])]);
    expect(suggestion).toMatchObject({ documentNo: "WEB2", confidence: "high" });
  });

  it("offers a small split-off, all of it ours, even if it covers little", () => {
    const many = [line(1, "19", 10), line(2, "957", 10), line(3, "4009", 10)];
    const [suggestion] = suggest(many, [], [doc("WEB1", "order", [["957", 1]])]);
    expect(suggestion.confidence).toBe("medium");
  });

  it("calls a mostly unrelated order that still shares a lot low", () => {
    const many = [line(1, "19", 4), line(2, "957", 4)];
    const [suggestion] = suggest(many, [], [
      doc("WEB1", "order", [["19", 2], ["501", 2], ["502", 2]]),
    ]);
    expect(suggestion.confidence).toBe("low");
  });

  it("brings up a VORD order for a short line, even with little in common", () => {
    const lines = [line(1, "19", 1), line(2, "957", 1)];
    const linked = [
      doc("WEB1", "order", [["19", 1], ["957", 1]], { leftOpenList: true }),
      doc("VFC1", "invoice", [["19", 1]], { orderNo: "WEB1" }),
    ];
    const big = Array.from({ length: 20 }, (_, i): [string, number] => [`9${i}`, 1]);
    const [suggestion] = suggest(lines, linked, [
      doc("VORD26-3088", "invoice", [["957", 1], ...big]),
    ]);
    expect(suggestion).toMatchObject({ documentNo: "VORD26-3088", createdByRust: true });
    expect(suggestion.reasons.join()).toContain("Created by Rust");
  });

  it("recognises an invoice from a VORD order by the order it names", () => {
    const [suggestion] = suggest(twoLines, [], [
      doc("VFC2", "invoice", [["19", 2], ["957", 1]], { orderNo: "VORD26-3088" }),
    ]);
    expect(suggestion.createdByRust).toBe(true);
  });

  it("doesn't bring up a weak VORD order when nothing is short", () => {
    const big = Array.from({ length: 20 }, (_, i): [string, number] => [`9${i}`, 1]);
    expect(suggest(twoLines, [], [doc("VORD1", "order", [["19", 1], ...big])])).toEqual([]);
  });

  it("never calls a credit note certain", () => {
    const linked = [doc("VFC1", "invoice", [])];
    const [suggestion] = suggest([line(1, "19", 1)], linked, [
      doc("VFC2", "creditmemo", [["19", 1]]),
    ]);
    expect(suggestion.confidence).toBe("medium");
  });

  it("offers nothing for an order that wasn't sent", () => {
    expect(
      suggestDocuments({ id: 7, sentAt: null }, twoLines, [], [doc("WEB1", "order", [["19", 2]])])
    ).toEqual([]);
  });

  it("puts the best one first", () => {
    const result = suggest(twoLines, [], [
      doc("WEB1", "order", [["19", 1], ["501", 1]]),
      doc("WEB2", "order", [["19", 2], ["957", 1]]),
    ]);
    expect(result.map((row) => row.documentNo)).toEqual(["WEB2", "WEB1"]);
  });
});

describe("suggestSubstitutes", () => {
  const extra = (itemNo: string, description: string) => ({ itemNo, description, quantity: 1 });

  it("finds the same drink in another crate", () => {
    const result = suggestSubstitutes("COCA COLA REGULAR KRAT 24/20CL", [
      extra("958", "COCA COLA REGULAR KRAT 24/25CL"),
      extra("16346", "TORK HANDDOEK ZZ"),
    ]);
    expect(result.map((row) => row.itemNo)).toEqual(["958"]);
  });

  it("isn't fooled by sharing only the packaging", () => {
    expect(
      suggestSubstitutes("LOOZA KRAT", [extra("1", "FANTA KRAT")])
    ).toEqual([]);
  });

  it("needs a description to go on", () => {
    expect(suggestSubstitutes(null, [extra("958", "COCA COLA")])).toEqual([]);
  });
});
