"use server";

import { revalidatePath } from "next/cache";
import { importSupplierProducts } from "@/lib/supplier/import-products";
import { importSupplierInvoices } from "@/lib/supplier/import-invoices";

export type ImportResult =
  | { ok: true; importId: number }
  | { ok: false; error: string };

export async function runSupplierImport(): Promise<ImportResult> {
  try {
    const importId = await importSupplierProducts();
    revalidatePath("/", "layout");
    return { ok: true, importId };
  } catch (error) {
    revalidatePath("/imports");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Import failed.",
    };
  }
}

export type InvoiceImportActionResult =
  | {
      ok: true;
      imported: number;
      lines: number;
      remaining: number;
      openOrders: number;
      creditMemos: number;
      openEntries: number;
    }
  | { ok: false; error: string };

// Reads posted invoices for their line discounts ("regelkorting"), which the
// supplier shows nowhere else.
export async function runInvoiceImport(): Promise<InvoiceImportActionResult> {
  try {
    const result = await importSupplierInvoices();
    revalidatePath("/", "layout");
    return {
      ok: true,
      imported: result.imported,
      lines: result.lines,
      remaining: result.remaining,
      openOrders: result.openOrders,
      creditMemos: result.creditMemos,
      openEntries: result.openEntries,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Import failed.",
    };
  }
}
