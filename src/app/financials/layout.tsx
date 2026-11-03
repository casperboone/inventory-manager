import Link from "next/link";
import { ImportButton } from "@/components/import-button";
import { SectionBar } from "@/components/section-tabs";
import { SyncStatusLine } from "@/components/sync-status-line";
import { Badge } from "@/components/ui/badge";
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
    <>
      <SectionBar label="Rust Financials" sections={SECTIONS}>
        <SyncStatusLine status={status} className="text-xs" />
        {/* Something past its due date is worth seeing without clicking. */}
        {open.overdue > 0 && (
          <Badge
            variant="destructive"
            render={<Link href="/financials/outstanding" />}
          >
            {formatPrice(open.overdue)} overdue
          </Badge>
        )}
        <ImportButton kind="documents" running={status.running} compact />
      </SectionBar>
      {children}
    </>
  );
}
