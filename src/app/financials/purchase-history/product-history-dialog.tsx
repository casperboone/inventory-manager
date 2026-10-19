"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatPrice, formatShortDate } from "@/lib/format";
import type { PurchaseDocumentLine } from "@/lib/products/purchases";
import { cn } from "@/lib/utils";
import { loadProductHistory } from "./actions";

const percentFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 1,
});

export type ProductHistoryTarget = { itemNo: string; description: string };

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

// Every document a product appears on, so you can see how its price and
// discount moved rather than just the year's summary.
export function ProductHistoryDialog({
  target,
  year,
  onClose,
}: {
  target: ProductHistoryTarget | null;
  year: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-3 sm:max-w-2xl sm:p-4">
        {target && (
          // Remounting per product starts it fresh, without the previous
          // product's rows or its "all years" choice.
          <ProductHistory key={target.itemNo} target={target} year={year} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductHistory({
  target,
  year,
}: {
  target: ProductHistoryTarget;
  year: string;
}) {
  const [lines, setLines] = useState<PurchaseDocumentLine[] | null>(null);
  const [allYears, setAllYears] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await loadProductHistory(
        target.itemNo,
        allYears ? undefined : year,
      );
      if (result.ok) setLines(result.lines);
      else toast.error(result.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allYears]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{target.description}</DialogTitle>
        <DialogDescription>
          Item {target.itemNo} ·{" "}
          {allYears ? "every document" : `documents in ${year}`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lines ? `${lines.length} documents` : "Loading…"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAllYears((value) => !value)}
          disabled={pending}
        >
          {pending && <Loader2Icon className="animate-spin" />}
          {allYears ? `Only ${year}` : "All years"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
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
                        · {line.quantity}×
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/financials/invoices/${encodeURIComponent(line.documentNo)}`}
                      className="hover:underline"
                    >
                      {line.documentNo}
                    </Link>
                    {line.documentType === "creditmemo" && (
                      <Badge variant="outline" className="ml-2">
                        credit
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {line.quantity ?? "—"}
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
                      ? `−${percentFormat.format(line.discountPercent)}%`
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
    </>
  );
}
