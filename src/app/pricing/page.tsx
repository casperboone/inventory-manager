import { parseItemParam } from "@/lib/items/params";
import { getPricingOverview } from "@/lib/pricing/queries";
import { PricingTable } from "./pricing-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing · Inventory Manager" };

export default async function PricingPage(props: PageProps<"/pricing">) {
  const { item } = await props.searchParams;
  const overview = await getPricingOverview();

  return (
    <PricingTable overview={overview} initialItemId={parseItemParam(item)} />
  );
}
