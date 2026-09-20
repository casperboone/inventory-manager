// One-off import of the Google Sheets assortment export.
//
//   npm run assortment:import -- "Prijsberekening - Sheet5.csv"
//
// Columns: nr to buy, TARGET, Product, Rust Article No. Category headings sit
// in the TARGET column on rows without a product. Everything below the ARCHIEF
// heading is skipped, and order amounts start at zero.
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { readFileSync } from "node:fs";

const SKIP_FROM_CATEGORY = "ARCHIEF";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = false;
      } else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") value += char;
  }
  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run assortment:import -- <file.csv>");

  const { db } = await import("@/db");
  const { assortmentCategories, assortmentItems, supplierProducts } =
    await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = parseCsv(readFileSync(file, "utf8")).slice(1);

  let categoryName: string | null = null;
  let skipping = false;
  const parsed: {
    category: string;
    name: string;
    target: number | null;
    itemNo: string | null;
  }[] = [];

  for (const row of rows) {
    const [, targetCell = "", productCell = "", articleCell = ""] = row;
    const target = targetCell.trim();
    const name = productCell.trim();
    const itemNo = articleCell.trim();

    if (!target && !name && !itemNo) continue;

    // A heading: a value in the target column without a product name.
    if (target && !name) {
      categoryName = target;
      skipping = target.toUpperCase() === SKIP_FROM_CATEGORY;
      continue;
    }
    if (skipping || !name || !categoryName) continue;

    const targetValue = Number(target.replace(",", "."));
    parsed.push({
      category: categoryName,
      name,
      target: target && Number.isFinite(targetValue) ? targetValue : null,
      itemNo: itemNo || null,
    });
  }

  const existing = await db.select().from(assortmentCategories);
  if (existing.length > 0) {
    throw new Error(
      "Assortment is not empty; clear assortment_items and assortment_categories first."
    );
  }

  const categoryNames = [...new Set(parsed.map((item) => item.category))];
  const categoryIds = new Map<string, number>();
  for (const [index, name] of categoryNames.entries()) {
    const [row] = await db
      .insert(assortmentCategories)
      .values({ name, position: index })
      .returning({ id: assortmentCategories.id });
    categoryIds.set(name, row.id);
  }

  const unlinked: string[] = [];
  const positions = new Map<string, number>();

  for (const item of parsed) {
    let supplierProductId: number | null = null;
    if (item.itemNo) {
      const product = await db.query.supplierProducts.findFirst({
        where: eq(supplierProducts.itemNo, item.itemNo),
        columns: { id: true },
      });
      supplierProductId = product?.id ?? null;
      if (!product) unlinked.push(`${item.name} (article ${item.itemNo})`);
    } else {
      unlinked.push(`${item.name} (no article number)`);
    }

    const position = positions.get(item.category) ?? 0;
    positions.set(item.category, position + 1);

    await db.insert(assortmentItems).values({
      categoryId: categoryIds.get(item.category)!,
      name: item.name,
      supplierProductId,
      target: item.target,
      position,
    });
  }

  console.log(
    `Imported ${categoryNames.length} categories and ${parsed.length} items.`
  );
  if (unlinked.length > 0) {
    console.log(`Not linked to a catalog product (${unlinked.length}):`);
    for (const name of unlinked) console.log(`  - ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
