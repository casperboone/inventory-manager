import Link from "next/link";
import { ImportButton } from "@/components/import-button";
import { SectionNav } from "@/components/section-tabs";
import { SyncStatusLine } from "@/components/sync-status-line";
import { formatPrice } from "@/lib/format";
import { getOpenEntries } from "@/lib/products/open-entries";
import { getSyncStatus } from "@/lib/products/queries";

const SECTIONS = [
  { href: "/financials/purchase-history", label: "Purchase History" },
  { href: "/financials/invoices", label: "Invoices" },
  { href: "/financials/orders", label: "Placed orders" },
  { href: "/financials/outstanding", label: "Outstanding" },
];

// Everything that comes from Rust Food's own bookkeeping sits behind one nav
// entry, since it is a secondary feature next to ordering.
export default async function FinancialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, open] = await Promise.all([
    getSyncStatus("documents"),
    getOpenEntries(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionNav sections={SECTIONS} match="prefix" />
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatusLine status={status} className="text-xs" />
          {/* Something past its due date is worth seeing without clicking. */}
          {open.overdue > 0 && (
            <Link
              href="/financials/outstanding"
              className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
            >
              {formatPrice(open.overdue)} overdue
            </Link>
          )}
          <ImportButton kind="documents" running={status.running} />
        </div>
      </div>
      {children}
    </div>
  );
}
