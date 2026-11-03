import { ImportButton } from "@/components/import-button";
import { SectionNav } from "@/components/section-tabs";
import { SyncStatusLine } from "@/components/sync-status-line";
import { getSyncStatus } from "@/lib/products/queries";

const SECTIONS = [
  { href: "/orders", label: "Orders" },
  { href: "/orders/not-delivered", label: "Not delivered" },
];

// The import is what makes Rust's orders and invoices show up here. It only
// runs when you press it.
export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = await getSyncStatus("documents");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionNav sections={SECTIONS} match="exact" />
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatusLine status={status} className="text-xs" />
          <ImportButton kind="documents" running={status.running} />
        </div>
      </div>
      {children}
    </div>
  );
}
