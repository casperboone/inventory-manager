"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supplierProducts } from "@/db/schema";
import { addToSupplierCart, type CartTotals } from "@/lib/supplier/cart-service";

export type QuickAddResult =
  | { ok: true; cart: CartTotals }
  | { ok: false; error: string };

// Adds a single catalog product to the cart at the supplier.
export async function quickAddToCart(
  itemNo: string,
  quantity: number
): Promise<QuickAddResult> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Enter an amount above zero." };
  }

  const product = await db.query.supplierProducts.findFirst({
    where: eq(supplierProducts.itemNo, itemNo),
    columns: { id: true, removedAt: true },
  });
  if (!product) {
    return { ok: false, error: "This product is not in the catalog." };
  }
  if (product.removedAt) {
    return { ok: false, error: "This product is gone from the catalog." };
  }

  try {
    const cart = await addToSupplierCart(itemNo, quantity);
    return { ok: true, cart };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Adding failed.",
    };
  }
}
