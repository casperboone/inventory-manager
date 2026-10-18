import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, formatPrice } from "@/lib/format";
import {
  listUnitPrice,
  type DiscountStatus,
} from "@/lib/products/discount-types";
import { cn } from "@/lib/utils";

const percentFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 1,
});

// Shows whether we get a line discount ("regelkorting") on a product, as last
// seen on an invoice. Products we never ordered stay unknown.
export function DiscountBadge({
  status,
  unitPrice,
  className,
}: {
  status: DiscountStatus | undefined;
  unitPrice?: number | null;
  className?: string;
}) {
  if (!status || status.kind === "unknown") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge
            variant="outline"
            className={cn("text-muted-foreground", className)}
          >
            ?
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Never ordered, so the discount is unknown.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status.kind === "none") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge
            variant="outline"
            className={cn("text-muted-foreground", className)}
          >
            no discount
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          No line discount on the last{" "}
          {status.documentType === "order" ? "order" : "invoice"}
          {status.invoicedAt && ` (${formatDate(status.invoicedAt)})`}.
        </TooltipContent>
      </Tooltip>
    );
  }

  const { discount } = status;
  const list = listUnitPrice(unitPrice ?? null, status);

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge
          className={cn(
            "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
            className
          )}
          variant="outline"
        >
          −{percentFormat.format(discount.percent)}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Line discount of {percentFormat.format(discount.percent)} % (
        {formatPrice(discount.amountPerUnit)} per unit), from{" "}
        {discount.documentType === "order" ? "order" : "invoice"}{" "}
        {discount.documentNo}
        {discount.invoicedAt ? ` of ${formatDate(discount.invoicedAt)}` : ""}.
        {list != null && (
          <> The list price would be about {formatPrice(list)}.</>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
