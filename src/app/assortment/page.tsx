import {
  getArchivedAssortment,
  getAssortment,
  getCategories,
} from "@/lib/assortment/queries";
import { OrderList } from "./order-list";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The catalog import and the cart calls run as server actions from this
// page, so they get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Assortment · Inventory Manager" };

export default async function AssortmentPage() {
  const [categories, archived, allCategories] = await Promise.all([
    getAssortment(),
    getArchivedAssortment(),
    getCategories(),
  ]);

  return (
    <OrderList
      categories={categories}
      archived={archived}
      allCategories={allCategories}
    />
  );
}
