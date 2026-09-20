"use server";

import { revalidatePath } from "next/cache";
import { importSupplierProducts } from "@/lib/supplier/import-products";

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
