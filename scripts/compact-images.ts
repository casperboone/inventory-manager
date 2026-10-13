// Re-encodes cached supplier images that are still stored the way the
// supplier served them (PNG/JPEG) into small webp, so the database stays
// small. Works on what is already stored; nothing is downloaded again.
//
//   npm run images:compact            report only
//   npm run images:compact -- --apply rewrite the oversized ones
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

// Anything above this is worth re-encoding.
const REENCODE_ABOVE_BYTES = 25 * 1024;

function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = await import("@/db");
  const { supplierProductImages } = await import("@/db/schema");
  const { makeFull } = await import("@/lib/supplier/image-service");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(supplierProductImages);
  let before = 0;
  let after = 0;
  let rewritten = 0;

  for (const row of rows) {
    const full = row.full ? Buffer.from(row.full) : null;
    before += (row.thumb?.length ?? 0) + (full?.length ?? 0);
    if (!full || full.length <= REENCODE_ABOVE_BYTES) {
      after += (row.thumb?.length ?? 0) + (full?.length ?? 0);
      continue;
    }

    let compacted: Buffer;
    try {
      compacted = await makeFull(full);
    } catch {
      console.warn(`Skipped ${row.itemNo}: could not re-encode.`);
      after += (row.thumb?.length ?? 0) + full.length;
      continue;
    }

    // Keep whichever is smaller; a tiny gif can beat webp.
    const best = compacted.length < full.length ? compacted : full;
    after += (row.thumb?.length ?? 0) + best.length;
    if (best !== full) {
      rewritten++;
      if (apply) {
        await db
          .update(supplierProductImages)
          .set({ full: best, fullContentType: "image/webp" })
          .where(eq(supplierProductImages.itemNo, row.itemNo));
      }
    }
  }

  console.log(`${rows.length} cached images`);
  console.log(`  now:   ${kb(before)}`);
  console.log(`  after: ${kb(after)} (${rewritten} rewritten)`);
  if (!apply && rewritten > 0) {
    console.log("\nRun with --apply to write this.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
