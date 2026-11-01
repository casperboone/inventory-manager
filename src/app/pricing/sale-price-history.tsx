import type { SalePriceChange } from "@/db/schema";
import { formatDate, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

// Every sale price an item has had, newest first.
export function SalePriceHistoryList({
  history,
  className,
}: {
  history: SalePriceChange[];
  className?: string;
}) {
  return (
    <ul className={cn("divide-y rounded-lg border text-xs", className)}>
      {history.map((change) => (
        <li
          key={change.id}
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 tabular-nums"
        >
          <span className="text-muted-foreground">
            {formatDate(change.createdAt)}
          </span>
          <span>
            {formatPrice(change.oldPrice)} → {formatPrice(change.newPrice)}
          </span>
          <span className="text-muted-foreground">
            cost {formatPrice(change.cost)}
          </span>
        </li>
      ))}
    </ul>
  );
}
