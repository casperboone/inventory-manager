import { ImportButton } from "@/components/import-button";
import { SectionBar } from "@/components/section-tabs";
import { SyncStatusLine } from "@/components/sync-status-line";
import { getNotDelivered } from "@/lib/orders/queries";
import { getSyncStatus } from "@/lib/products/queries";

// The import is what makes Rust's orders and invoices show up here. It only
// runs when you press it.
export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, notDelivered] = await Promise.all([
    getSyncStatus("documents"),
    getNotDelivered(),
  ]);

  return (
    <>
      <SectionBar
        label="Orders"
        sections={[
          { href: "/orders", label: "Overview" },
          {
            href: "/orders/not-delivered",
            label: "Not delivered",
            count: notDelivered.lines.length + notDelivered.overdue.length,
          },
        ]}
      >
        <SyncStatusLine status={status} className="text-xs" />
        <ImportButton kind="documents" running={status.running} compact />
      </SectionBar>
      {children}
    </>
  );
}
