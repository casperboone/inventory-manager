import { listDocuments } from "@/lib/products/documents";
import { DocumentList } from "../document-list";

export const dynamic = "force-dynamic";

// The layout's invoice import runs as a server action from this page, and
// maxDuration applies per page, so it gets the platform maximum here too.
export const maxDuration = 60;
export const metadata = { title: "Invoices · Inventory Manager" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvoicesPage(
  props: PageProps<"/financials/invoices">
) {
  const params = await props.searchParams;
  const search = first(params.q);
  const result = await listDocuments({
    types: ["invoice", "creditmemo"],
    search,
    page: Number(first(params.page)) || 1,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Posted invoices and credit notes at Rust Food, as imported. Search
          also looks inside the lines, so you can find every invoice a product
          is on.
        </p>
      </div>

      <DocumentList
        documents={result.documents}
        basePath="/financials/invoices"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        search={search}
        showType
        emptyMessage={
          search ? "Nothing found." : "No invoices imported yet."
        }
      />
    </div>
  );
}
