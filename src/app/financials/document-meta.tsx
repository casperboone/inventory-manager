import Link from "next/link";
import { TruckIcon } from "lucide-react";
import { formatDate, formatPrice } from "@/lib/format";
import type { DocumentHeader } from "@/lib/products/documents";

// The details the supplier keeps next to a document: when it is coming, what
// it came from, and the references. Only what is actually filled in shows.
export function DocumentMeta({
  header,
  orderLinked,
}: {
  header: DocumentHeader;
  // False once the order has been invoiced and dropped from the open list.
  orderLinked?: boolean;
}) {
  const delivery = header.promisedDeliveryDate ?? header.requestedDeliveryDate;
  const items: React.ReactNode[] = [];

  if (delivery) {
    items.push(
      <span key="delivery" className="inline-flex items-center gap-1.5">
        <TruckIcon className="size-4 text-muted-foreground" />
        {header.promisedDeliveryDate ? "Promised" : "Requested"} for{" "}
        <strong className="font-medium">{formatDate(delivery)}</strong>
        {header.requestedDeliveryDate &&
          header.promisedDeliveryDate &&
          header.requestedDeliveryDate.getTime() !==
            header.promisedDeliveryDate.getTime() && (
            <span className="text-muted-foreground">
              (asked for {formatDate(header.requestedDeliveryDate)})
            </span>
          )}
      </span>
    );
  }

  if (header.orderNo) {
    items.push(
      <span key="order">
        From order{" "}
        {orderLinked ? (
          <Link
            href={`/financials/orders/${encodeURIComponent(header.orderNo)}`}
            className="font-mono underline-offset-2 hover:underline"
          >
            {header.orderNo}
          </Link>
        ) : (
          <span className="font-mono">{header.orderNo}</span>
        )}
      </span>
    );
  }

  if (header.yourReference) {
    items.push(<span key="reference">Reference {header.yourReference}</span>);
  }

  if (header.salespersonCode) {
    items.push(<span key="seller">Sold by {header.salespersonCode}</span>);
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-background px-4 py-3 text-sm">
      {items}
    </div>
  );
}

// Both totals, since the supplier bills excluding VAT but collects including.
export function DocumentTotals({
  header,
  totals,
  label,
}: {
  header: DocumentHeader;
  totals: { lines: number; discount: number };
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
      {totals.discount > 0.005 && (
        <span className="text-muted-foreground">
          Line discount saved {formatPrice(totals.discount)}
        </span>
      )}
      {header.amountIncludingVat != null && (
        <span className="text-muted-foreground">
          Incl. VAT{" "}
          <span className="tabular-nums">
            {formatPrice(header.amountIncludingVat)}
          </span>
        </span>
      )}
      <span>
        {label}{" "}
        <strong className="tabular-nums">
          {formatPrice(header.amount ?? totals.lines)}
        </strong>
      </span>
    </div>
  );
}
