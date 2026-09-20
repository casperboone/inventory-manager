import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import {
  supplierImports,
  supplierPriceChanges,
  supplierProducts,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { AuthService } from "./auth-service";
import { CatalogService } from "./catalog-service";
import { parseCatalogRow, type CatalogProduct } from "./catalog-row";
import { HttpClient } from "./http-client";

// An import still "running" after this long is assumed to have crashed.
const STALE_IMPORT_MS = 15 * 60 * 1000;
const PAUSE_BETWEEN_PAGES_MS = 500;

type ImportOptions = {
  // Rows per request to the supplier.
  pageSize?: number;
  // Stop after this many rows. A limited import never marks products removed.
  limit?: number;
};

function envNumber(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function importSupplierProducts(
  options: ImportOptions = {}
): Promise<number> {
  const pageSize = options.pageSize ?? envNumber("SUPPLIER_PAGE_SIZE") ?? 1000;
  const limit = options.limit ?? envNumber("SUPPLIER_IMPORT_LIMIT");

  await db
    .update(supplierImports)
    .set({ status: "failed", error: "Timed out", finishedAt: new Date() })
    .where(
      and(
        eq(supplierImports.status, "running"),
        lt(supplierImports.startedAt, new Date(Date.now() - STALE_IMPORT_MS))
      )
    );

  const running = await db.query.supplierImports.findFirst({
    where: eq(supplierImports.status, "running"),
  });
  if (running) {
    throw new Error("An import is already running.");
  }

  const [run] = await db
    .insert(supplierImports)
    .values({ startedAt: new Date() })
    .returning({ id: supplierImports.id });

  try {
    const { products, reportedCount } = await fetchCatalog(pageSize, limit);
    const complete = !limit && products.length >= reportedCount;
    if (!complete) {
      logger.warn(
        `Import #${run.id} is partial (${products.length}/${reportedCount}); not marking products as removed.`
      );
    }

    const stats = await applyCatalog(run.id, products, complete);

    await db
      .update(supplierImports)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        reportedCount,
        fetchedCount: products.length,
        ...stats,
      })
      .where(eq(supplierImports.id, run.id));

    logger.info(
      `Import #${run.id} succeeded: ${stats.newCount} new, ${stats.updatedCount} updated, ${stats.priceChangedCount} price changes, ${stats.removedCount} removed.`
    );
    return run.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Import #${run.id} failed: ${message}`);
    await db
      .update(supplierImports)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(supplierImports.id, run.id));
    throw error;
  }
}

async function fetchCatalog(pageSize: number, limit: number | undefined) {
  const http = new HttpClient();
  await new AuthService(http).authenticate();
  const catalog = new CatalogService(http);

  const products = new Map<string, CatalogProduct>();
  let reportedCount = Infinity;
  let start = 0;

  while (start < reportedCount && (!limit || start < limit)) {
    if (start > 0) {
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_PAGES_MS));
    }
    const length = limit ? Math.min(pageSize, limit - start) : pageSize;
    const page = await catalog.fetchPage(start, length);
    if (reportedCount === Infinity) {
      reportedCount = page.recordsTotal ?? page.data.length;
    }

    for (const row of page.data) {
      let product: CatalogProduct;
      try {
        product = parseCatalogRow(row);
      } catch (error) {
        // Skipping a row makes the import partial, so nothing gets marked
        // removed because of it.
        logger.warn(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (products.has(product.itemNo)) {
        logger.warn(`Duplicate item number ${product.itemNo} in catalog.`);
      }
      products.set(product.itemNo, product);
    }

    if (page.data.length < length) break;
    start += page.data.length;
  }

  return {
    products: [...products.values()],
    reportedCount: reportedCount === Infinity ? products.size : reportedCount,
  };
}

const COMPARED_FIELDS = [
  "supplierId",
  "description",
  "description2",
  "unitOfMeasure",
  "qtyPerUnitOfMeasure",
  "integerOnly",
  "unitPrice",
  "gtin",
  "inSupplierAssortment",
] as const;

async function applyCatalog(
  importId: number,
  products: CatalogProduct[],
  complete: boolean
) {
  const existing = new Map(
    (await db.select().from(supplierProducts)).map((p) => [p.itemNo, p])
  );

  const now = new Date();
  const statements: BatchItem<"sqlite">[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let priceChangedCount = 0;

  for (const product of products) {
    const current = existing.get(product.itemNo);

    if (!current) {
      newCount++;
      statements.push(
        db.insert(supplierProducts).values({
          ...product,
          firstImportId: importId,
          lastSeenImportId: importId,
        })
      );
      continue;
    }

    const changed =
      current.removedAt !== null ||
      COMPARED_FIELDS.some((field) => current[field] !== product[field]);

    if (changed) updatedCount++;
    statements.push(
      db
        .update(supplierProducts)
        .set(
          changed
            ? {
                ...product,
                lastSeenImportId: importId,
                removedAt: null,
                removedInImportId: null,
                updatedAt: now,
              }
            : { lastSeenImportId: importId }
        )
        .where(eq(supplierProducts.id, current.id))
    );

    if (current.unitPrice !== product.unitPrice) {
      priceChangedCount++;
      statements.push(
        db.insert(supplierPriceChanges).values({
          productId: current.id,
          importId,
          oldPrice: current.unitPrice,
          newPrice: product.unitPrice,
        })
      );
    }
  }

  const removeStatement = db
    .update(supplierProducts)
    .set({ removedAt: now, removedInImportId: importId, updatedAt: now })
    .where(
      and(
        isNull(supplierProducts.removedAt),
        or(
          isNull(supplierProducts.lastSeenImportId),
          ne(supplierProducts.lastSeenImportId, importId)
        )
      )
    )
    .returning({ id: supplierProducts.id });

  // Only a complete catalog tells us which products are gone. The remove
  // statement runs last, after every seen product got this import's id.
  if (complete) statements.push(removeStatement);
  if (statements.length === 0) {
    return { newCount, updatedCount, priceChangedCount, removedCount: 0 };
  }

  // One batch = one transaction and a single round trip, also on remote libSQL.
  const results = await db.batch(
    statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
  );
  const removedCount = complete
    ? (results.at(-1) as { id: number }[]).length
    : 0;

  return { newCount, updatedCount, priceChangedCount, removedCount };
}
