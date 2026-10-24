import { getPricingOverview } from "@/lib/pricing/queries";
import { Calculator } from "./calculator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price calculator · Inventory Manager" };

export default async function CalculatorPage() {
  const { categories, settings, reference } = await getPricingOverview();

  return (
    <Calculator
      categories={categories}
      rounding={settings.priceRounding}
      reference={reference}
    />
  );
}
