import { getPricingOverview } from "@/lib/pricing/queries";
import { CategoriesEditor } from "./categories-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing categories · Inventory Manager" };

export default async function PricingCategoriesPage() {
  const { rows, categories, settings } = await getPricingOverview();

  const usage = new Map<number, number>();
  for (const row of rows) {
    if (row.pricingCategoryId != null) {
      usage.set(
        row.pricingCategoryId,
        (usage.get(row.pricingCategoryId) ?? 0) + 1,
      );
    }
  }

  return (
    <CategoriesEditor
      categories={categories.map((category) => ({
        ...category,
        itemCount: usage.get(category.id) ?? 0,
      }))}
      settings={settings}
      // Only something with alcohol can be the yardstick for alcohol.
      referenceCandidates={rows
        .filter((row) => row.alcoholPercentage && !row.notForSale)
        .map((row) => ({ id: row.id, name: row.name }))}
    />
  );
}
