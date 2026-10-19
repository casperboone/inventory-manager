import Link from "next/link";
import { InvoiceImportButton } from "@/components/invoice-import-button";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { getDocumentSummary } from "@/lib/products/documents";
import { getOpenEntries } from "@/lib/products/open-entries";
import { FinancialsNav } from "./financials-nav";

// Everything that comes from Rust Food's own bookkeeping sits behind one nav
// entry, since it is a secondary feature next to ordering.
export default async function FinancialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [summary, open] = await Promise.all([
    getDocumentSummary(),
    getOpenEntries(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FinancialsNav />
        <div className="flex flex-wrap items-center gap-3">
          {/* Says at a glance how far the imported data runs. */}
          <p className="text-xs text-muted-foreground">
            {formatNumber(summary.invoices)} invoices
            {summary.creditMemos > 0 &&
              ` · ${formatNumber(summary.creditMemos)} credit notes`}
            {summary.latestInvoice &&
              ` · last ${formatDate(summary.latestInvoice)}`}
          </p>
          {/* Something past its due date is worth seeing without clicking. */}
          {open.overdue > 0 && (
            <Link
              href="/financials/outstanding"
              className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
            >
              {formatPrice(open.overdue)} overdue
            </Link>
          )}
          <InvoiceImportButton />
        </div>
      </div>
      {children}
    </div>
  );
}
