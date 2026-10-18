import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon, XIcon } from "lucide-react";
import { ImportButton } from "@/components/import-button";
import { ProductsTable } from "@/components/products-table";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getDiscountStatuses } from "@/lib/products/discounts";
import {
  getLatestSuccessfulImport,
  getUnitsOfMeasure,
  isImportRunning,
  searchProducts,
  SORTS,
  type ProductSort,
  type ProductStatus,
} from "@/lib/products/queries";
import { ProductFilters } from "./product-filters";

// The catalog import and the cart calls run as server actions from this
// page, so they get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Supplier catalog · Inventory Manager" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage(props: PageProps<"/products">) {
  const params = await props.searchParams;
  const q = first(params.q);
  const unit = first(params.unit);
  const statusParam = first(params.status);
  const status: ProductStatus =
    statusParam === "removed" || statusParam === "all" ? statusParam : "active";
  const sortParam = first(params.sort);
  const sort: ProductSort =
    sortParam && sortParam in SORTS ? (sortParam as ProductSort) : "description";
  const dir = first(params.dir) === "desc" ? "desc" : "asc";
  const page = Number(first(params.page)) || 1;
  const newInImportId = Number(first(params.new)) || undefined;

  const discountFilter = first(params.discount);
  const [result, units, latestImport, importRunning] = await Promise.all([
    searchProducts({
      q,
      unit,
      status,
      assortment: first(params.assortment) === "1",
      newInImportId,
      discount:
        discountFilter === "yes" || discountFilter === "no" || discountFilter === "unknown"
          ? discountFilter
          : undefined,
      sort,
      dir,
      page,
    }),
    getUnitsOfMeasure(),
    getLatestSuccessfulImport(),
    isImportRunning(),
  ]);

  const discounts = await getDiscountStatuses(
    result.rows.map((product) => product.itemNo)
  );

  // In an initial import every product is new, so there is nothing to highlight.
  const newHighlightImport =
    latestImport?.newCount && latestImport.newCount < (latestImport.fetchedCount ?? 0)
      ? latestImport
      : undefined;

  function href(changes: Record<string, string | number | null>) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = first(value);
      if (v) next.set(key, v);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Supplier catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Rust Food
            {latestImport
              ? ` · last imported ${formatDateTime(latestImport.finishedAt)}`
              : " · not imported yet"}
          </p>
        </div>
        <ImportButton running={importRunning} />
      </div>

      {newHighlightImport && !newInImportId && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm">
          <SparklesIcon className="size-4 text-amber-500" />
          <span>
            <strong>{formatNumber(newHighlightImport.newCount)}</strong> new
            product{newHighlightImport.newCount === 1 ? "" : "s"} in the last
            import.
          </span>
          <Link
            href={href({ new: newHighlightImport.id, page: null })}
            className="font-medium underline-offset-4 hover:underline"
          >
            Show them
          </Link>
          <Link
            href={`/imports/${newHighlightImport.id}`}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Import details
          </Link>
        </div>
      )}

      {newInImportId && (
        <div className="flex items-center gap-2 text-sm">
          <span>
            Showing products new in import #{newInImportId}.
          </span>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={href({ new: null, page: null })} />}
          >
            <XIcon />
            Show all
          </Button>
        </div>
      )}

      <Suspense>
        <ProductFilters units={units} />
      </Suspense>

      <ProductsTable
        products={result.rows}
        discounts={discounts}
        newImportId={newHighlightImport?.id}
        sorting={{
          sort,
          dir,
          href: (s, d) => href({ sort: s, dir: d, page: null }),
        }}
        emptyMessage={
          latestImport
            ? "No products match these filters."
            : "No products yet. Run an import to fetch the supplier catalog."
        }
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {formatNumber(result.total)} product{result.total === 1 ? "" : "s"}
        </span>
        {result.pageCount > 1 && (
          <div className="flex items-center gap-2">
            <PageButton
              href={result.page > 1 ? href({ page: result.page - 1 }) : null}
            >
              <ChevronLeftIcon />
              Previous
            </PageButton>
            <span>
              Page {result.page} of {result.pageCount}
            </span>
            <PageButton
              href={
                result.page < result.pageCount
                  ? href({ page: result.page + 1 })
                  : null
              }
            >
              Next
              <ChevronRightIcon />
            </PageButton>
          </div>
        )}
      </div>
    </div>
  );
}

function PageButton({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={href} scroll={false} />}
    >
      {children}
    </Button>
  );
}
