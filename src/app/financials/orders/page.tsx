import { listDocuments } from "@/lib/products/documents";
import { DocumentList } from "../document-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders · Inventory Manager" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrdersPage(
  props: PageProps<"/financials/orders">
) {
  const params = await props.searchParams;
  const search = first(params.q);
  const result = await listDocuments({
    types: ["order"],
    search,
    page: Number(first(params.page)) || 1,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Orders placed but not invoiced yet. They already carry their line
          discounts, and disappear here once their invoice arrives.
        </p>
      </div>

      <DocumentList
        documents={result.documents}
        basePath="/financials/orders"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        search={search}
        emptyMessage={
          search ? "Nothing found." : "Nothing open at the moment."
        }
      />
    </div>
  );
}
