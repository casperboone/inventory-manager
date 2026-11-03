import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getNotDelivered } from "@/lib/orders/queries";
import { orderLabel } from "@/lib/orders/reference";
import { NotDeliveredRow } from "./not-delivered-row";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The document import runs as a server action from this page.
export const maxDuration = 60;

export const metadata = { title: "Not delivered · Inventory Manager" };

export default async function NotDeliveredPage() {
  const { lines, overdue } = await getNotDelivered();
  const nothing = lines.length === 0 && overdue.length === 0;

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Not delivered</h1>
        <p className="text-sm text-muted-foreground">
          What we ordered that isn&apos;t on the invoice. A line shows up once
          its Rust order is invoiced and off the open list.
        </p>
      </div>

      {nothing && (
        <p className="rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing missing as far as Rust has told us.
        </p>
      )}

      {lines.length > 0 && (
        <section className="overflow-hidden rounded-lg border bg-background">
          <ul className="divide-y">
            {lines.map((row) => (
              <NotDeliveredRow
                key={row.line.id}
                row={{
                  lineId: row.line.id,
                  name: row.line.name,
                  itemNo: row.line.itemNo,
                  ordered: row.line.quantity,
                  got: row.got,
                  shortBy: row.shortBy,
                  status: row.status,
                  orderId: row.order.id,
                  orderLabel: orderLabel(row.order),
                  sentAt: row.order.sentAt,
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {overdue.length > 0 && (
        <section className="overflow-hidden rounded-lg border bg-background">
          <h2 className="border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
            Sent over two weeks ago, still no invoice
          </h2>
          <ul className="divide-y">
            {overdue.map((order) => (
              <li key={order.id} className="px-3 py-2 text-sm">
                <Link
                  href={`/orders/${order.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {orderLabel(order)}
                </Link>{" "}
                <span className="text-xs text-muted-foreground tabular-nums">
                  Sent {formatDate(order.sentAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
