// One-off import of the old pricing sheet into the assortment we already have.
//
//   npm run pricing:import -- Prijsberekening.xlsx           # show what it does
//   npm run pricing:import -- Prijsberekening.xlsx --apply   # and write it
//
// Reads the "Categorieën" sheet into pricing categories, and per row of
// "Prijsberekening" the pricing category, portions, VAT, alcohol and sale
// price onto the matching assortment item. Rows are matched by Rust article
// number within the same heading (our order categories came from the same
// sheet), then by name. Alcohol comes from the supplier's description when it
// names it. Everything below the ARCHIEF heading is skipped, and
// items the sheet doesn't know are left alone. Refuses to run when pricing
// categories already exist, so it can't overwrite what was edited in the app.
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import readXlsxFile from "read-excel-file/node";

const SKIP_FROM_HEADING = "ARCHIEF";

type Cell = string | number | boolean | Date | null;

const text = (cell: Cell | undefined) =>
  cell == null ? "" : String(cell).trim();
const num = (cell: Cell | undefined) =>
  typeof cell === "number" && Number.isFinite(cell) ? cell : null;
const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) {
    throw new Error("Usage: npm run pricing:import -- <file.xlsx> [--apply]");
  }

  const { db } = await import("@/db");
  const {
    assortmentItems,
    pricingCategories,
    pricingSettings,
    salePriceChanges,
  } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { getAssortment } = await import("@/lib/assortment/queries");
  const { parseContents } = await import("@/lib/pricing/contents");
  const { advicePrice, portionCost, roundPrice } =
    await import("@/lib/pricing/calc");

  const sheets = await readXlsxFile(file);
  const sheet = (name: string) => {
    const found = sheets.find((candidate) => candidate.sheet === name);
    if (!found) throw new Error(`The file has no sheet "${name}".`);
    return found.data as Cell[][];
  };

  // Categorie, Basismarge, Kantelprijs, Duurmarge, Tapverlies, toelichting.
  const categories = sheet("Categorieën")
    .slice(1)
    .filter((row) => text(row[0]) && num(row[1]) != null)
    .map((row) => ({
      name: text(row[0]),
      baseMargin: num(row[1])!,
      pivotPrice: num(row[2])!,
      premiumMargin: num(row[3])!,
      wastage: num(row[4]) ?? 0,
      notes: text(row[5]).replace(/\s+/g, " ") || null,
      vatRate: 0.21,
    }));

  const rounding =
    num(
      sheet("Instellingen").find(
        (row) => text(row[0]) === "Prijsafronding",
      )?.[1],
    ) ?? 0.1;

  // Headings sit in column B on rows without a product.
  type SheetRow = {
    heading: string;
    name: string;
    articleNo: string | null;
    category: string | null;
    unit: number | null;
    portion: number | null;
    portionSize: number | null;
    price: number | null;
    vat: number | null;
    salePrice: number | null;
    alcohol: number | null;
  };
  const rows: SheetRow[] = [];
  let heading = "";
  for (const row of sheet("Prijsberekening").slice(1)) {
    const name = text(row[2]);
    if (!name) {
      if (text(row[1])) heading = text(row[1]);
      continue;
    }
    if (same(heading, SKIP_FROM_HEADING)) break;
    rows.push({
      heading,
      name,
      articleNo: text(row[3]) || null,
      category: text(row[4]) || null,
      unit: num(row[9]),
      portion: num(row[10]),
      portionSize: num(row[11]),
      price: num(row[13]),
      vat: num(row[14]),
      salePrice: num(row[19]),
      alcohol: num(row[22]),
    });
  }

  // The sheet sets VAT per row; the most common rate in a category becomes
  // its default and the rest become overrides. Blank cells are left to the
  // default rather than read as 0%.
  for (const category of categories) {
    const counts = new Map<number, number>();
    for (const row of rows) {
      if (row.category === category.name && row.vat != null) {
        counts.set(row.vat, (counts.get(row.vat) ?? 0) + 1);
      }
    }
    const [top] = [...counts].sort((a, b) => b[1] - a[1]);
    if (top) category.vatRate = top[0];
  }

  const existing = await db.select().from(pricingCategories);
  if (existing.length > 0) {
    throw new Error(
      "Pricing categories already exist; this import only runs on an empty setup.",
    );
  }

  const items = (await getAssortment())
    .flatMap((category) =>
      category.items.map((item) => ({ ...item, categoryName: category.name })),
    )
    .filter((item) => item.kind === "product");
  const matched = new Set<number>();

  const findItem = (row: SheetRow) => {
    const open = items.filter((item) => !matched.has(item.id));
    const inHeading = open.filter((item) =>
      same(item.categoryName, row.heading),
    );
    const byArticle = (list: typeof open) =>
      row.articleNo ? list.filter((item) => item.itemNo === row.articleNo) : [];
    const byName = (list: typeof open) =>
      list.filter((item) => same(item.name, row.name));
    for (const candidates of [
      byArticle(inHeading),
      byName(inHeading),
      byArticle(open),
      byName(open),
    ]) {
      if (candidates.length === 1) return candidates[0];
    }
    return null;
  };

  type Planned = {
    item: (typeof items)[number];
    row: SheetRow;
    values: {
      pricingCategory: string | null;
      notForSale: boolean;
      unitVolume: number | null;
      portionVolume: number | null;
      portionsPerUnit: number | null;
      alcoholPercentage: number | null;
      vatRate: number | null;
      manualPurchasePrice: number | null;
      salePrice: number | null;
    };
    cost: number | null;
    advice: number | null;
  };
  const planned: Planned[] = [];
  const unmatched: SheetRow[] = [];
  const unknownCategories = new Set<string>();

  for (const row of rows) {
    const item = findItem(row);
    if (!item) {
      unmatched.push(row);
      continue;
    }
    matched.add(item.id);

    const category = row.category
      ? categories.find((candidate) => same(candidate.name, row.category!))
      : undefined;
    if (row.category && !category) unknownCategories.add(row.category);

    const contents = parseContents(item.supplierDescription);
    // "Portie size" is liters per portion; for food the sheet puts a 1 there.
    const portionVolume =
      category && category.name !== "Food" ? row.portionSize : null;
    const sheetPortions =
      row.unit && row.portion ? row.unit / row.portion : null;
    const unitVolume = item.itemNo ? contents.unitVolume : null;
    // Only keep the sheet's own count when the contents don't give the same.
    const portionsPerUnit =
      sheetPortions &&
      !(
        unitVolume &&
        portionVolume &&
        Math.abs(unitVolume / portionVolume - sheetPortions) < 0.01
      )
        ? Number(sheetPortions.toFixed(4))
        : null;

    const values = {
      pricingCategory: category?.name ?? null,
      notForSale: !category,
      unitVolume,
      portionVolume,
      portionsPerUnit,
      // The supplier's description beats the sheet, which copied 5% around.
      alcoholPercentage: contents.alcoholPercentage ?? (row.alcohol || null),
      vatRate:
        category && row.vat != null && row.vat !== category.vatRate
          ? row.vat
          : null,
      // What we buy elsewhere has no catalog price to fall back on.
      manualPurchasePrice: item.itemNo ? null : row.price,
      salePrice: category ? row.salePrice : null,
    };

    const cost = category
      ? portionCost(
          {
            purchasePrice: values.manualPurchasePrice ?? item.unitPrice,
            unitVolume: values.unitVolume,
            portionVolume: values.portionVolume,
            portionsPerUnit: values.portionsPerUnit,
            vatRate: values.vatRate,
            alcoholPercentage: values.alcoholPercentage,
          },
          category,
        )
      : null;
    const advice =
      category && cost != null
        ? roundPrice(advicePrice(cost, category), rounding)
        : null;
    planned.push({ item, row, values, cost, advice });
  }

  const reference = planned.find(
    (plan) =>
      same(plan.item.name, "Queer Beer") && same(plan.row.heading, "TAP"),
  );

  const pct = (value: number | null) =>
    value == null ? "" : `${Number((value * 100).toFixed(1))}%`;
  const eur = (value: number | null) => (value == null ? "" : value.toFixed(2));

  console.log(`Pricing categories (${categories.length}):`);
  console.table(
    categories.map((category) => ({
      name: category.name,
      base: pct(category.baseMargin),
      pivot: eur(category.pivotPrice),
      premium: pct(category.premiumMargin),
      loss: pct(category.wastage),
      vat: pct(category.vatRate),
    })),
  );
  console.log(
    `Rounding: ${rounding}, alcohol reference: ${reference?.item.name ?? "none"}`,
  );

  console.log(`\nItems (${planned.length}):`);
  console.table(
    planned.map(({ item, values, cost, advice }) => ({
      item: `${item.name} (${item.categoryName})`,
      category: values.pricingCategory ?? "not for sale",
      portions:
        values.portionsPerUnit ??
        (values.unitVolume && values.portionVolume
          ? Number((values.unitVolume / values.portionVolume).toFixed(2))
          : ""),
      vat: values.vatRate != null ? pct(values.vatRate) : "",
      alcohol: pct(values.alcoholPercentage),
      purchase: eur(values.manualPurchasePrice ?? item.unitPrice),
      cost: eur(cost),
      advice: eur(advice),
      price: eur(values.salePrice),
    })),
  );

  if (unknownCategories.size > 0) {
    console.log(
      `\nUnknown pricing categories: ${[...unknownCategories].join(", ")}`,
    );
  }
  if (unmatched.length > 0) {
    console.log(
      `\nIn the sheet but not in the assortment (${unmatched.length}):`,
    );
    for (const row of unmatched) {
      console.log(
        `  - ${row.name} (${row.heading}${row.articleNo ? `, article ${row.articleNo}` : ""})`,
      );
    }
  }
  const untouched = items.filter((item) => !matched.has(item.id));
  if (untouched.length > 0) {
    console.log(
      `\nIn the assortment but not in the sheet (${untouched.length}), left alone:`,
    );
    for (const item of untouched)
      console.log(`  - ${item.name} (${item.categoryName})`);
  }

  if (!apply) {
    console.log("\nNothing written. Run again with --apply to import.");
    return;
  }

  const categoryIds = new Map<string, number>();
  for (const [position, category] of categories.entries()) {
    const [created] = await db
      .insert(pricingCategories)
      .values({ ...category, position })
      .returning({ id: pricingCategories.id });
    categoryIds.set(category.name, created.id);
  }

  for (const { item, values, cost } of planned) {
    const { pricingCategory, ...rest } = values;
    await db
      .update(assortmentItems)
      .set({
        ...rest,
        pricingCategoryId: pricingCategory
          ? categoryIds.get(pricingCategory)!
          : null,
        salePriceCost: values.salePrice != null ? cost : null,
        updatedAt: new Date(),
      })
      .where(eq(assortmentItems.id, item.id));
    if (values.salePrice != null) {
      await db.insert(salePriceChanges).values({
        itemId: item.id,
        oldPrice: null,
        newPrice: values.salePrice,
        cost,
      });
    }
  }

  await db
    .insert(pricingSettings)
    .values({
      id: 1,
      priceRounding: rounding,
      alcoholReferenceItemId: reference?.item.id ?? null,
    })
    .onConflictDoNothing();

  console.log(
    `\nImported ${categories.length} pricing categories and pricing for ${planned.length} items.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
