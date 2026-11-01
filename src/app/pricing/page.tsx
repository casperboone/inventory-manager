import { getCategories } from "@/lib/assortment/queries";
import { parseItemParam } from "@/lib/items/params";
import { getPricingOverview } from "@/lib/pricing/queries";
import { PricingTable } from "./pricing-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing · Inventory Manager" };

export default async function PricingPage(props: PageProps<"/pricing">) {
  const { item } = await props.searchParams;
  const [overview, orderCategories] = await Promise.all([
    getPricingOverview(),
    getCategories(),
  ]);

  const itemId = parseItemParam(item);
  const initialItem = overview.rows.find((row) => row.id === itemId) ?? null;

  return (
    <PricingTable
      overview={overview}
      orderCategories={orderCategories}
      initialItem={initialItem}
    />
  );
}
