import {
  getArchivedAssortment,
  getAssortment,
} from "@/lib/assortment/queries";
import { parseItemParam } from "@/lib/items/params";
import {
  getCurrentDraftId,
  getDraftQuantities,
  getDrafts,
  getOneOffs,
} from "@/lib/orders/drafts";
import { getLastBought } from "@/lib/products/purchases";
import { OrderList } from "./order-list";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The catalog import and the cart calls run as server actions from this
// page, so they get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Order list · Inventory Manager" };

export default async function OrderListPage(props: PageProps<"/order-list">) {
  const { item } = await props.searchParams;
  const [categories, archived, drafts] = await Promise.all([
    getAssortment(),
    getArchivedAssortment(),
    getDrafts(),
  ]);
  const currentOrderId = await getCurrentDraftId(drafts);
  const [quantities, oneOffs] = await Promise.all([
    getDraftQuantities(currentOrderId),
    getOneOffs(currentOrderId),
  ]);

  // Notes share the table with items but have no dialog.
  const itemId = parseItemParam(item);
  const rows = [...categories, ...archived].flatMap(
    (category) => category.items,
  );
  const initialItem =
    rows.find((row) => row.kind === "product" && row.id === itemId) ?? null;
  const lastBought = await getLastBought(
    rows.flatMap((row) => (row.itemNo ? [row.itemNo] : [])),
  );

  return (
    <OrderList
      categories={categories}
      archived={archived}
      lastBought={lastBought}
      initialItem={initialItem}
      drafts={drafts}
      currentOrderId={currentOrderId}
      serverQuantities={quantities}
      oneOffs={oneOffs}
    />
  );
}
