import { getCategories } from "@/lib/assortment/queries";
import { getPricingOverview } from "@/lib/pricing/queries";
import { PricingTable } from "./pricing-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing · Inventory Manager" };

export default async function PricingPage() {
  const [overview, orderCategories] = await Promise.all([
    getPricingOverview(),
    getCategories(),
  ]);

  return <PricingTable overview={overview} orderCategories={orderCategories} />;
}
