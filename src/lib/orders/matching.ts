import { parseOrderReference } from "./reference";

// How an order is doing, worked out from what Rust's documents say. Nothing
// here touches the database, so all the odd cases can be tested directly.

export type ProgressLine = {
  id: number;
  name: string;
  itemNo: string | null;
  quantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  resolution: "accepted" | "substituted" | null;
  substituteItemNo: string | null;
};

export type DocumentLine = {
  itemNo: string;
  description: string | null;
  quantity: number | null;
};

export type RustDocument = {
  documentNo: string;
  type: "order" | "invoice" | "creditmemo";
  date: Date | null;
  reference: string | null;
  lines: DocumentLine[];
  // Rust orders: gone from the open list, so nothing more is coming on it.
  leftOpenList?: boolean;
  // Invoices: the Rust order it came from, when Rust told us.
  orderNo?: string | null;
};

export type LineStatus =
  // Invoiced, or ticked off, in full.
  | "delivered"
  // Short and that's fine, by your say.
  | "accepted"
  // Rust sent something else, and it covers this line.
  | "substituted"
  // Nothing to match it against: yours to tick off.
  | "by_hand"
  // Hasn't gone to the cart.
  | "not_sent"
  // Could still come.
  | "waiting"
  // Its Rust orders are invoiced and done, and part of it isn't there.
  | "short"
  // The same, with none of it there.
  | "missing";

export type LineProgress = {
  id: number;
  status: LineStatus;
  // On a linked Rust order, whatever became of it.
  onRustOrder: number;
  // On linked invoices, less linked credit notes.
  invoiced: number;
  // What it adds up to, ticked off amounts included.
  got: number;
  shortBy: number;
  // More came than this line asked for.
  overBy: number;
};

export type OrderStage =
  | "in_cart"
  | "placed"
  | "partly_invoiced"
  | "invoiced"
  | "complete";

export type OrderProgress = {
  stage: OrderStage;
  lines: LineProgress[];
  // On linked documents but not on this order: bought directly at Rust, say.
  extras: { itemNo: string; description: string | null; quantity: number }[];
  // Negative lines on invoices. These are usually from an older delivery, so
  // they aren't held against this order's amounts.
  returns: { itemNo: string; description: string | null; quantity: number }[];
  // Invoiced and off the open list; what isn't there now is missing.
  settled: boolean;
  // Sent a while ago and still no invoice.
  overdue: boolean;
  shortCount: number;
  toTickCount: number;
};

export const OVERDUE_AFTER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Lines that aren't something we ordered: deposits on crates and kegs, the fuel
// surcharge and the supplier's corrections.
export function isNonProductLine(line: {
  itemNo: string;
  description: string | null;
}) {
  const description = (line.description ?? "").toUpperCase();
  return (
    description.includes("EMBALLAGE") ||
    description.includes("BRANDSTOFTOESLAG") ||
    description.startsWith("CORRECTIE") ||
    line.itemNo.toUpperCase() === "DIVERSE"
  );
}

const round = (value: number) => Math.round(value * 1000) / 1000;

// Rust's orders are done when each has left the open list and has its invoice.
// An invoice that doesn't say which order it's from counts for any order
// without one, because the link is often not known.
function isSettled(documents: RustDocument[]) {
  const invoices = documents.filter((doc) => doc.type === "invoice");
  if (invoices.length === 0) return false;

  const rustOrders = documents.filter((doc) => doc.type === "order");
  if (rustOrders.some((doc) => !doc.leftOpenList)) return false;

  const unpaired = invoices.filter((doc) => !doc.orderNo).length;
  const withoutInvoice = rustOrders.filter(
    (order) => !invoices.some((doc) => doc.orderNo === order.documentNo)
  ).length;
  return withoutInvoice <= unpaired;
}

function addTo(
  pool: Map<string, number>,
  itemNo: string,
  quantity: number
) {
  pool.set(itemNo, (pool.get(itemNo) ?? 0) + quantity);
}

function take(pool: Map<string, number>, itemNo: string, wanted: number) {
  const available = Math.max(0, pool.get(itemNo) ?? 0);
  const taken = Math.min(available, wanted);
  pool.set(itemNo, (pool.get(itemNo) ?? 0) - taken);
  return taken;
}

export function computeProgress(
  lines: ProgressLine[],
  documents: RustDocument[],
  sentAt: Date | null,
  now: Date
): OrderProgress {
  const invoiced = new Map<string, number>();
  const onOrder = new Map<string, number>();
  const descriptions = new Map<string, string | null>();
  const returns: OrderProgress["returns"] = [];

  for (const document of documents) {
    for (const line of document.lines) {
      const quantity = line.quantity ?? 0;
      if (quantity === 0 || isNonProductLine(line)) continue;
      if (!descriptions.get(line.itemNo)) {
        descriptions.set(line.itemNo, line.description);
      }
      if (document.type === "order") {
        if (quantity > 0) addTo(onOrder, line.itemNo, quantity);
      } else if (document.type === "creditmemo") {
        // On a credit note a positive amount is what got credited.
        addTo(invoiced, line.itemNo, -quantity);
      } else if (quantity > 0) {
        addTo(invoiced, line.itemNo, quantity);
      } else {
        returns.push({
          itemNo: line.itemNo,
          description: line.description,
          quantity,
        });
      }
    }
  }

  // Two lines can be one product. Handed out in order, each gets what it asked
  // for before the next, so the shortage lands on the last one.
  const results = new Map<number, LineProgress>();
  for (const line of lines) {
    const rustOrder = line.itemNo
      ? take(onOrder, line.itemNo, line.quantity)
      : 0;
    const fromInvoices = line.itemNo
      ? take(invoiced, line.itemNo, line.quantity)
      : 0;
    results.set(line.id, {
      id: line.id,
      status: "waiting",
      onRustOrder: rustOrder,
      invoiced: fromInvoices,
      got: fromInvoices + line.receivedQuantity,
      shortBy: 0,
      overBy: 0,
    });
  }
  // A replacement only gets what's left, so it never takes from a line that
  // asked for that product itself.
  for (const line of lines) {
    if (line.resolution !== "substituted" || !line.substituteItemNo) continue;
    const result = results.get(line.id)!;
    const missing = Math.max(0, line.quantity - result.got);
    const fromInvoices = take(invoiced, line.substituteItemNo, missing);
    result.invoiced += fromInvoices;
    result.got += fromInvoices;
    result.onRustOrder += take(onOrder, line.substituteItemNo, missing);
  }

  // What's left over: too much of something we ordered, or something we didn't.
  const extras: OrderProgress["extras"] = [];
  for (const [itemNo, left] of invoiced) {
    const owners = lines.filter(
      (line) =>
        line.itemNo === itemNo ||
        (line.resolution === "substituted" &&
          line.substituteItemNo === itemNo)
    );
    if (left <= 0) continue;
    if (owners.length > 0) {
      results.get(owners[owners.length - 1].id)!.overBy = round(left);
    } else {
      extras.push({
        itemNo,
        description: descriptions.get(itemNo) ?? null,
        quantity: round(left),
      });
    }
  }
  // Only what's on a Rust order and hasn't been invoiced is still to be told
  // apart, and that's only worth showing when nothing on an invoice says it.
  for (const [itemNo, left] of onOrder) {
    if (left <= 0 || lines.some((line) => line.itemNo === itemNo)) continue;
    if (extras.some((extra) => extra.itemNo === itemNo)) continue;
    extras.push({
      itemNo,
      description: descriptions.get(itemNo) ?? null,
      quantity: round(left),
    });
  }

  const settled = isSettled(documents);
  const hasInvoice = documents.some((doc) => doc.type === "invoice");

  for (const line of lines) {
    const result = results.get(line.id)!;
    result.onRustOrder = round(result.onRustOrder);
    result.invoiced = round(result.invoiced);
    result.got = round(result.got);
    result.shortBy = round(Math.max(0, line.quantity - result.got));
    result.status = lineStatus(line, result, settled);
  }

  const progress = lines.map((line) => results.get(line.id)!);
  const finished = (status: LineStatus) =>
    status === "delivered" || status === "accepted" || status === "substituted";

  let stage: OrderStage;
  if (lines.length > 0 && progress.every((line) => finished(line.status))) {
    stage = "complete";
  } else if (documents.length === 0) {
    stage = "in_cart";
  } else if (!hasInvoice) {
    stage = "placed";
  } else {
    stage = settled ? "invoiced" : "partly_invoiced";
  }

  return {
    stage,
    lines: progress,
    extras,
    returns,
    settled,
    overdue:
      stage !== "complete" &&
      !hasInvoice &&
      sentAt !== null &&
      now.getTime() - sentAt.getTime() > OVERDUE_AFTER_DAYS * DAY_MS,
    shortCount: progress.filter(
      (line) => line.status === "short" || line.status === "missing"
    ).length,
    toTickCount: progress.filter((line) => line.status === "by_hand").length,
  };
}

function lineStatus(
  line: ProgressLine,
  result: LineProgress,
  settled: boolean
): LineStatus {
  if (result.shortBy === 0) {
    return line.resolution === "substituted" ? "substituted" : "delivered";
  }
  if (line.resolution === "accepted") return "accepted";
  if (!line.itemNo) return "by_hand";
  // A forgotten or refused line can still come, if you added it at Rust.
  if (line.sentQuantity < line.quantity && result.got === 0 && !settled) {
    return "not_sent";
  }
  if (!settled) return "waiting";
  return result.got > 0 ? "short" : "missing";
}

export type Suggestion = {
  documentNo: string;
  type: RustDocument["type"];
  date: Date | null;
  score: number;
  confidence: "high" | "medium" | "low";
  // Lines of ours it covers.
  matched: number;
  // Rust made this one (a VORD order), so it won't carry a reference.
  createdByRust: boolean;
  reasons: string[];
};

// How long after sending a document can still belong to an order.
const WINDOW_DAYS = { order: 14, invoice: 45, creditmemo: 90 } as const;

// An invoice has its own number, so it goes by the order it says it came from.
function isCreatedByRust(document: RustDocument) {
  return /^VORD/i.test(document.orderNo ?? document.documentNo);
}

// Documents that look like they came from this order, best first. These are
// only ever offered: nothing gets linked on a guess. What each is compared with
// is what's still open, so a second Rust order for the leftovers of a first
// still scores well.
export function suggestDocuments(
  order: { id: number; sentAt: Date | null },
  lines: ProgressLine[],
  progress: LineProgress[],
  candidates: RustDocument[]
): Suggestion[] {
  if (!order.sentAt) return [];
  const sentAt = order.sentAt.getTime();
  const byId = new Map(progress.map((line) => [line.id, line]));

  // What's open per product, on the Rust order side and on the invoice side.
  const stillOpen = (side: "onRustOrder" | "got") => {
    const open = new Map<string, number>();
    for (const line of lines) {
      if (!line.itemNo || line.resolution) continue;
      const done = byId.get(line.id)?.[side] ?? 0;
      const left = line.quantity - done;
      if (left > 0) addTo(open, line.itemNo, left);
    }
    return open;
  };
  const openOnOrder = stillOpen("onRustOrder");
  const openOnInvoice = stillOpen("got");
  const hasShortLine = progress.some(
    (line) => line.status === "short" || line.status === "missing"
  );

  const suggestions: Suggestion[] = [];
  for (const document of candidates) {
    // It says it's another order's.
    const named = parseOrderReference(document.reference);
    if (named !== null && named !== order.id) continue;

    if (!document.date) continue;
    const days = (document.date.getTime() - sentAt) / DAY_MS;
    // A day of slack: dates in the portal vary by a day between its lists.
    if (days < -1 || days > WINDOW_DAYS[document.type]) continue;

    const open = document.type === "order" ? openOnOrder : openOnInvoice;
    const quantities = new Map<string, number>();
    for (const line of document.lines) {
      if (isNonProductLine(line) || (line.quantity ?? 0) === 0) continue;
      addTo(quantities, line.itemNo, Math.abs(line.quantity!));
    }
    const docTotal = [...quantities.values()].reduce((a, b) => a + b, 0);
    if (docTotal === 0) continue;

    const openTotal = [...open.values()].reduce((a, b) => a + b, 0);
    let overlap = 0;
    let matched = 0;
    for (const [itemNo, quantity] of quantities) {
      const wanted = open.get(itemNo) ?? 0;
      if (wanted > 0) {
        overlap += Math.min(wanted, quantity);
        matched++;
      }
    }
    if (overlap === 0) continue;

    const coverage = openTotal > 0 ? overlap / openTotal : 0;
    const precision = overlap / docTotal;
    const score = Math.round((0.6 * coverage + 0.4 * precision) * 100) / 100;
    const createdByRust = isCreatedByRust(document);
    if (score < 0.25 && precision < 0.5 && !(createdByRust && hasShortLine)) {
      continue;
    }

    const reasons = [
      `${matched} of its ${quantities.size} product${quantities.size === 1 ? "" : "s"} ${matched === 1 ? "is" : "are"} on this order`,
    ];
    if (days > 1) reasons.push(`${Math.round(days)} days after sending`);
    else if (days >= -1) reasons.push("Around when it was sent");
    if (createdByRust) reasons.push("Created by Rust, so no reference");
    if (document.type === "creditmemo") reasons.push("A credit note");

    suggestions.push({
      documentNo: document.documentNo,
      type: document.type,
      date: document.date,
      score,
      // A credit note says too little by itself to call it certain.
      confidence:
        score >= 0.75 && document.type !== "creditmemo"
          ? "high"
          : score >= 0.4
            ? "medium"
            : "low",
      matched,
      createdByRust,
      reasons,
    });
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

// Words that say what kind of packaging it is, not what's in it.
const PACKAGING = new Set(["KRAT", "FUST", "BLIK", "GLAS", "FLES", "DOOS", "LTR"]);

function words(text: string) {
  return new Set(
    text
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((word) => word.length >= 3)
  );
}

// What came instead of a short line: an extra with a description that's mostly
// the same, like the same drink in another crate.
export function suggestSubstitutes(
  description: string | null,
  extras: OrderProgress["extras"]
) {
  if (!description) return [];
  const ours = words(description);
  return extras
    .map((extra) => {
      const theirs = words(extra.description ?? "");
      const shared = [...ours].filter((word) => theirs.has(word));
      const union = new Set([...ours, ...theirs]);
      return {
        extra,
        similarity: union.size > 0 ? shared.length / union.size : 0,
        // Sharing only "KRAT" says nothing about what's inside.
        telling: shared.some((word) => !PACKAGING.has(word)),
      };
    })
    .filter((match) => match.telling && match.similarity >= 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .map((match) => match.extra);
}
