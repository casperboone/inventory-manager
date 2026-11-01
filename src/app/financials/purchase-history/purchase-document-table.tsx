import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatNumber,
  formatPrice,
  formatShortDate,
} from "@/lib/format";
import type { PurchaseDocumentLine } from "@/lib/products/purchases";
import { cn } from "@/lib/utils";

const MONEY_TOLERANCE = 0.005;

type Change = "up" | "down" | null;

// Rows come newest first, so each one is compared with the document below it.
function changeAgainstPrevious(
  current: number | null | undefined,
  previous: number | null | undefined,
): Change {
  if (current == null || previous == null) return null;
  if (Math.abs(current - previous) <= MONEY_TOLERANCE) return null;
  return current > previous ? "up" : "down";
}

// Every document a product appears on, marking where its price or discount
// moved. Without lines yet (null) it shows that they are still loading.
export function PurchaseDocumentTable({
  lines,
  className,
}: {
  lines: PurchaseDocumentLine[] | null;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <Table className="text-[11px] [&_td]:px-1.5 [&_th]:px-1.5 sm:text-sm sm:[&_td]:px-2 sm:[&_th]:px-2">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-24">Date</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="hidden w-12 text-right sm:table-cell">
              Qty
            </TableHead>
            <TableHead className="w-20 text-right">Price</TableHead>
            <TableHead className="w-16 text-right">Disc.</TableHead>
            <TableHead className="w-20 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-20 text-center text-muted-foreground"
              >
                Nothing found.
              </TableCell>
            </TableRow>
          )}
          {lines === null && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-20 text-center text-muted-foreground"
              >
                <Loader2Icon className="mx-auto size-4 animate-spin" />
              </TableCell>
            </TableRow>
          )}
          {lines?.map((line, index) => {
            const previous = lines[index + 1];
            const priceChange = changeAgainstPrevious(
              line.netUnitPrice ?? line.unitPrice,
              previous?.netUnitPrice ?? previous?.unitPrice,
            );
            const discountChange = changeAgainstPrevious(
              line.discountPercent ?? 0,
              previous ? (previous.discountPercent ?? 0) : undefined,
            );
            const changed = priceChange !== null || discountChange !== null;

            return (
              <TableRow
                key={`${line.documentNo}-${index}`}
                className={cn(
                  // The documents where something actually moved.
                  changed && "bg-amber-50/70 dark:bg-amber-950/20",
                )}
              >
                <TableCell className="whitespace-nowrap">
                  <span className="sm:hidden">
                    {formatShortDate(line.documentDate)}
                  </span>
                  <span className="hidden sm:inline">
                    {formatDate(line.documentDate)}
                  </span>
                  {line.quantity != null && (
                    <span className="text-muted-foreground sm:hidden">
                      {" "}
                      · {formatNumber(line.quantity)}×
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px] whitespace-normal sm:text-xs">
                  <Link
                    href={`/financials/invoices/${encodeURIComponent(line.documentNo)}`}
                    className="whitespace-nowrap hover:underline"
                  >
                    {line.documentNo}
                  </Link>
                  {line.documentType === "creditmemo" && (
                    <Badge variant="outline" className="sm:ml-2">
                      credit
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatNumber(line.quantity)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    priceChange === "up" &&
                      "font-medium text-red-600 dark:text-red-400",
                    priceChange === "down" &&
                      "font-medium text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {priceChange === "up" && "↑ "}
                  {priceChange === "down" && "↓ "}
                  {formatPrice(line.netUnitPrice ?? line.unitPrice)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    discountChange === "up" &&
                      "font-medium text-emerald-700 dark:text-emerald-400",
                    discountChange === "down" &&
                      "font-medium text-red-600 dark:text-red-400",
                    !discountChange &&
                      (line.discountPercent
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground"),
                  )}
                >
                  {discountChange === "up" && "↑ "}
                  {discountChange === "down" && "↓ "}
                  {line.discountPercent
                    ? `−${formatNumber(line.discountPercent, 1)}%`
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPrice(line.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
