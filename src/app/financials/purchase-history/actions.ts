"use server";

import {
  getProductPurchaseHistory,
  type PurchaseDocumentLine,
} from "@/lib/products/purchases";

export type ProductHistoryResult =
  | { ok: true; lines: PurchaseDocumentLine[] }
  | { ok: false; error: string };

// Loaded when a product row is opened, so the page itself stays light.
export async function loadProductHistory(
  itemNo: string,
  year?: string
): Promise<ProductHistoryResult> {
  try {
    const lines = await getProductPurchaseHistory(itemNo, { year });
    return { ok: true, lines };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load this.",
    };
  }
}
