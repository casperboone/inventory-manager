// Pre-fetches product images so browsing never waits on the supplier.
// By default only the products in our own assortment, because caching the
// whole catalog costs far more database space than it is worth.
//
//   npm run supplier:images                 products in our assortment
//   npm run supplier:images -- --catalog    the entire supplier catalog
//   npm run supplier:images -- --all        also re-check ones without an image
//   npm run supplier:images -- --limit 50
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const CONCURRENCY = 4;

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const { db } = await import("@/db");
  const { supplierProducts } = await import("@/db/schema");
  const { getProductImage } = await import("@/lib/supplier/image-service");
  const { isNull, or, eq, and } = await import("drizzle-orm");

  const all = process.argv.includes("--all");
  const limit = Number(arg("limit")) || undefined;

  const { assortmentItems } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  const catalogWide = process.argv.includes("--catalog");

  // Which products to warm: everything, or only what we actually sell.
  const assortmentProductIds = catalogWide
    ? null
    : (
        await db
          .select({ id: assortmentItems.supplierProductId })
          .from(assortmentItems)
      )
        .map((row) => row.id)
        .filter((id): id is number => id !== null);

  const products = await db
    .select({ itemNo: supplierProducts.itemNo })
    .from(supplierProducts)
    .where(
      and(
        isNull(supplierProducts.removedAt),
        assortmentProductIds
          ? inArray(supplierProducts.id, assortmentProductIds)
          : undefined,
        all
          ? undefined
          : or(
              isNull(supplierProducts.imageStatus),
              eq(supplierProducts.imageStatus, "available")
            )
      )
    )
    .limit(limit ?? 100000);

  console.log(
    `Warming ${products.length} product images (${catalogWide ? "whole catalog" : "our assortment"})…`
  );
  let done = 0;
  let failed = 0;

  const queue = [...products];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const product = queue.shift()!;
        try {
          await getProductImage(product.itemNo, "thumb");
        } catch {
          failed++;
        }
        if (++done % 100 === 0) {
          console.log(`${done}/${products.length} (${failed} failed)`);
        }
      }
    })
  );

  console.log(`Done: ${done} images, ${failed} failed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
