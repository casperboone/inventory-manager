import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { supplierConfig } from "./config";
import {
  getSupplierSession,
  isLoginRedirect,
  resetSupplierSession,
} from "./session";

// What the supplier reports back about the whole cart after an add.
export type CartTotals = {
  totalItems?: number;
  totalQuantity?: number;
  // Comes as HTML, e.g. "&euro;&nbsp;47.71".
  totalPrice?: string;
};

// Adds one product to the shopping cart in the supplier's webshop, the same
// call their order page makes.
export async function addToSupplierCart(
  itemNo: string,
  quantity: number,
  retry = true
): Promise<CartTotals> {
  const session = getSupplierSession();
  const http = await session;

  const payload = new URLSearchParams();
  payload.set("itemNoOrGTIN", itemNo);
  payload.set("quantity", String(quantity));

  const response = await http.postForm(
    "/OrderConfirm/quickItemAdd",
    payload,
    {
      accept: "application/json, text/javascript, */*; q=0.01",
      origin: supplierConfig.baseUrl,
      referer: `${supplierConfig.baseUrl}/orderconfirm`,
      "x-requested-with": "XMLHttpRequest",
    }
  );

  if (isLoginRedirect(response)) {
    resetSupplierSession(session);
    if (retry) return addToSupplierCart(itemNo, quantity, false);
    throw new Error("Supplier session could not be re-established.");
  }
  if (!response.ok) {
    throw new Error(`Supplier answered ${response.status}.`);
  }

  const text = (await response.text()).trim();
  logger.info(
    `Cart add ${itemNo} x${quantity}: ${response.status} ${text.slice(0, 200)}`
  );

  // The endpoint answers with JSON; anything that looks like a failure counts
  // as one, and an HTML body means we were not really logged in.
  if (text.startsWith("<")) {
    throw new Error("Supplier returned a page instead of a result.");
  }
  if (!text) return {};

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: only treat it as a failure if it reads like an error.
    if (/error|fout|failed/i.test(text)) throw new Error(text.slice(0, 200));
    return {};
  }

  const failed =
    body.success === false ||
    body.Success === false ||
    body.error != null ||
    body.Error != null;
  if (failed) {
    const message =
      (body.message ?? body.Message ?? body.error ?? body.Error) ||
      "rejected by the supplier";
    throw new Error(String(message));
  }

  return readTotals(body);
}

export type CartLine = {
  itemNo: string;
  // The portal's own product id (`supplier_products.supplier_id`): the bulk
  // endpoint keys on it and does not take item numbers.
  supplierId: number;
  quantity: number;
  unitOfMeasure: string | null;
};

export type BulkCartResult = {
  // The item numbers the supplier confirmed; anything missing was refused.
  added: string[];
  cart: CartTotals;
};

// Adds many products in one request, the way the catalog's "add all" button
// does, instead of a round trip per line.
export async function addManyToSupplierCart(
  lines: CartLine[],
  retry = true
): Promise<BulkCartResult> {
  if (lines.length === 0) return { added: [], cart: {} };

  const session = getSupplierSession();
  const http = await session;

  // Every line gets a key that comes back with the answer, so we can tell
  // which ones were accepted. It has to be a uuid: the portal parses it as
  // one and refuses the whole batch over anything else.
  const keys = new Map<string, string>();
  const payload = {
    // [product id, quantity, variant, unit, key]
    items: lines.map((line) => {
      const key = randomUUID() as string;
      keys.set(key, line.itemNo);
      return [
        line.supplierId,
        String(line.quantity),
        null,
        line.unitOfMeasure,
        key,
      ];
    }),
  };

  const response = await http.postJson("/Product/additems", payload, {
    accept: "application/json, text/javascript, */*; q=0.01",
    origin: supplierConfig.baseUrl,
    referer: `${supplierConfig.baseUrl}/Product/Catalog`,
    "x-requested-with": "XMLHttpRequest",
  });

  if (isLoginRedirect(response)) {
    resetSupplierSession(session);
    if (retry) return addManyToSupplierCart(lines, false);
    throw new Error("Supplier session could not be re-established.");
  }
  if (!response.ok) {
    throw new Error(`Supplier answered ${response.status}.`);
  }

  const text = (await response.text()).trim();
  logger.info(
    `Cart bulk add of ${lines.length} lines: ${response.status} ${text.slice(0, 300)}`
  );
  if (text.startsWith("<")) {
    throw new Error("Supplier returned a page instead of a result.");
  }

  const body = JSON.parse(text) as {
    addedItems?: { Key?: unknown }[];
    Messages?: unknown[];
  };

  // A line the supplier would not take makes the whole call fail, so the
  // answer is either everything or nothing. The caller falls back to adding
  // the lines one by one, which also says which one was the problem.
  const added = (body.addedItems ?? []).flatMap((item) =>
    typeof item?.Key === "string" && keys.has(item.Key)
      ? [keys.get(item.Key)!]
      : []
  );

  return { added, cart: readTotals(body as Record<string, unknown>) };
}

function readTotals(body: Record<string, unknown>): CartTotals {
  return {
    totalItems: typeof body.totalItems === "number" ? body.totalItems : undefined,
    totalQuantity:
      typeof body.totalQuantity === "number" ? body.totalQuantity : undefined,
    totalPrice:
      typeof body.totalPrice === "string"
        ? decodeHtml(body.totalPrice)
        : undefined,
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&euro;/g, "€")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
