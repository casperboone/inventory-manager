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
