import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from "lucide-react";
import { PurchaseRows } from "./purchase-rows";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import {
  getPurchaseLines,
  getPurchaseYears,
  PURCHASE_SORTS,
  type PurchaseSort,
} from "@/lib/products/purchases";
import { cn } from "@/lib/utils";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

export const metadata = { title: "Purchase History · Inventory Manager" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// A column header that sorts, and flips direction when it is already active.
function SortLink({
  column,
  sort,
  dir,
  href,
  align,
  children,
}: {
  column: PurchaseSort;
  sort: PurchaseSort;
  dir: "asc" | "desc";
  href: (changes: Record<string, string | null>) => string;
  align?: "right";
  children: React.ReactNode;
}) {
  const active = sort === column;
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  const Icon = active && dir === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <Link
      href={href({ sort: column, dir: nextDir })}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        align === "right" && "flex-row-reverse",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
      {active && <Icon className="size-3.5" />}
    </Link>
  );
}

export default async function PurchaseHistoryPage(
  props: PageProps<"/financials/purchase-history">,
) {
  const params = await props.searchParams;
  const includeDeposits = first(params.deposits) === "1";

  const sortParam = first(params.sort);
  const sort: PurchaseSort = (PURCHASE_SORTS as readonly string[]).includes(
    sortParam ?? "",
  )
    ? (sortParam as PurchaseSort)
    : "total";
  const dir = first(params.dir) === "asc" ? "asc" : "desc";

  const years = await getPurchaseYears({ includeDeposits });
  const selectedYear = first(params.year) ?? years[0]?.year;
  const lines = selectedYear
    ? await getPurchaseLines(selectedYear, { includeDeposits, sort, dir })
    : [];

  const biggestYear = Math.max(1, ...years.map((year) => Math.abs(year.total)));
  const selected = years.find((year) => year.year === selectedYear);
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    if (selectedYear) next.set("year", selectedYear);
    if (includeDeposits) next.set("deposits", "1");
    if (sort !== "total") next.set("sort", sort);
    if (dir !== "desc") next.set("dir", dir);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/financials/purchase-history?${qs}` : "/financials/purchase-history";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchase History
          </h1>
          <p className="text-sm text-muted-foreground">
            What we bought per year, from the invoices and credit notes at Rust
            Food. Amounts exclude VAT.
          </p>
        </div>
        <Link
          href={href({ deposits: includeDeposits ? null : "1" })}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
            includeDeposits
              ? "bg-background font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
          scroll={false}
        >
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded border",
              includeDeposits && "bg-primary text-primary-foreground",
            )}
          >
            {includeDeposits && <CheckIcon className="size-3" />}
          </span>
          Count deposits
        </Link>
      </div>

      <section className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-20">Year</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Invoices
              </TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Products
              </TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Units
              </TableHead>
              {!includeDeposits && (
                <TableHead className="hidden text-right sm:table-cell">
                  Deposits
                </TableHead>
              )}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-36">Last invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No invoices imported yet.
                </TableCell>
              </TableRow>
            )}
            {years.map((year) => (
              <TableRow
                key={year.year}
                className={cn(
                  "relative",
                  year.year === selectedYear && "bg-primary/5",
                )}
              >
                <TableCell className="font-medium">
                  <Link
                    href={href({ year: year.year })}
                    scroll={false}
                    className="after:absolute after:inset-0"
                  >
                    {year.year}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumber(year.documents)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumber(year.products)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumber(Math.round(year.quantity))}
                </TableCell>
                {!includeDeposits && (
                  <TableCell className="hidden text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
                    {formatPrice(year.deposits)}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 rounded-full bg-primary/30"
                      style={{
                        width: `${Math.round((Math.abs(year.total) / biggestYear) * 60)}px`,
                      }}
                    />
                    <span className="font-medium tabular-nums">
                      {formatPrice(year.total)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(year.lastInvoiceDate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {selected && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {selected.year}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {lines.length} products · {formatPrice(selected.total)}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Last invoice in {selected.year}:{" "}
              {formatDate(selected.lastInvoiceDate)}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border bg-background">
            <Table className="text-xs sm:text-sm">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="hidden w-28 sm:table-cell">
                    Item no.
                  </TableHead>
                  <TableHead>
                    <SortLink
                      column="description"
                      sort={sort}
                      dir={dir}
                      href={href}
                    >
                      <span className="sm:hidden">Product</span>
                      <span className="hidden sm:inline">Description</span>
                    </SortLink>
                  </TableHead>
                  <TableHead className="w-12 text-right sm:w-20">
                    <SortLink
                      column="quantity"
                      sort={sort}
                      dir={dir}
                      href={href}
                      align="right"
                    >
                      Units
                    </SortLink>
                  </TableHead>
                  <TableHead className="hidden w-28 text-right sm:table-cell">
                    <SortLink
                      column="price"
                      sort={sort}
                      dir={dir}
                      href={href}
                      align="right"
                    >
                      Avg price
                    </SortLink>
                  </TableHead>
                  <TableHead className="w-14 text-right sm:w-24">
                    <SortLink
                      column="discount"
                      sort={sort}
                      dir={dir}
                      href={href}
                      align="right"
                    >
                      <span className="sm:hidden">Disc.</span>
                      <span className="hidden sm:inline">Discount</span>
                    </SortLink>
                  </TableHead>
                  <TableHead className="w-24 text-right sm:w-28">
                    <SortLink
                      column="total"
                      sort={sort}
                      dir={dir}
                      href={href}
                      align="right"
                    >
                      Total
                    </SortLink>
                  </TableHead>
                  <TableHead className="hidden w-32 sm:table-cell">
                    <SortLink
                      column="lastBought"
                      sort={sort}
                      dir={dir}
                      href={href}
                    >
                      Last bought
                    </SortLink>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <PurchaseRows lines={lines} year={selected.year} />
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Credit notes are subtracted. Orders that have not been invoiced yet
            are left out, so a recent order only appears here once its invoice
            arrives.
            {!includeDeposits &&
              " Deposits on crates and kegs are excluded; the deposits column shows what they came to."}
          </p>
        </section>
      )}
    </div>
  );
}
