// Pre-fetches product images so browsing never waits on the supplier.
//
//   npm run supplier:images              all products not checked yet
//   npm run supplier:images -- --all     re-check products without an image too
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

  const products = await db
    .select({ itemNo: supplierProducts.itemNo })
    .from(supplierProducts)
    .where(
      and(
        isNull(supplierProducts.removedAt),
        all
          ? undefined
          : or(
              isNull(supplierProducts.imageStatus),
              eq(supplierProducts.imageStatus, "available")
            )
      )
    )
    .limit(limit ?? 100000);

  console.log(`Warming ${products.length} product images…`);
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
