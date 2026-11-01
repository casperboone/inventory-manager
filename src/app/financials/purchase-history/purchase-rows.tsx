"use client";

import { useState } from "react";
import { ItemLinks } from "@/components/item-links";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import type { ItemLink } from "@/lib/items/queries";
import type { PurchaseLine } from "@/lib/products/purchases";
import { cn } from "@/lib/utils";
import {
  ProductHistoryDialog,
  type ProductHistoryTarget,
} from "./product-history-dialog";

// The rows of the product table. Clicking one opens every document the
// product appears on; what we also sell as an item of our own links to it.
export function PurchaseRows({
  lines,
  year,
  items,
}: {
  lines: PurchaseLine[];
  year: string;
  items: Map<string, ItemLink[]>;
}) {
  const [target, setTarget] = useState<ProductHistoryTarget | null>(null);

  return (
    <>
      <TableBody>
        {lines.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={7}
              className="h-24 text-center text-sm text-muted-foreground"
            >
              Nothing bought in this year.
            </TableCell>
          </TableRow>
        )}
        {lines.map((line) => (
          <TableRow
            key={line.itemNo}
            onClick={() =>
              setTarget({ itemNo: line.itemNo, description: line.description })
            }
            className="cursor-pointer"
          >
            <TableCell className="hidden font-mono text-xs sm:table-cell">
              {line.itemNo}
            </TableCell>
            <TableCell className="min-w-28 break-words whitespace-normal">
              {line.description}
              {line.total < 0 && (
                <Badge variant="outline" className="ml-2">
                  credited
                </Badge>
              )}
              {/* Following a link shouldn't open the row's dialog as well. */}
              <span onClick={(event) => event.stopPropagation()}>
                <ItemLinks items={items.get(line.itemNo)} />
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatNumber(Math.round(line.quantity))}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              <span className="text-muted-foreground">
                {line.averageUnitPrice == null
                  ? "—"
                  : formatPrice(line.averageUnitPrice)}
              </span>
              {/* First and last price of the year, so you can see
                  which way it went. Only shown when it moved. */}
              {line.firstUnitPrice != null &&
                line.lastUnitPrice != null &&
                Math.abs(line.lastUnitPrice - line.firstUnitPrice) > 0.005 && (
                  <span
                    className={cn(
                      "block text-[11px]",
                      line.lastUnitPrice > line.firstUnitPrice
                        ? "text-red-600/80 dark:text-red-400/80"
                        : "text-emerald-700/80 dark:text-emerald-400/80",
                    )}
                  >
                    {formatPrice(line.firstUnitPrice)} →{" "}
                    {formatPrice(line.lastUnitPrice)}
                  </span>
                )}
            </TableCell>
            <TableCell className="text-right">
              {line.discountPercent ? (
                <span className="text-xs font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
                  −{formatNumber(line.discountPercent, 1)}%
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              {/* How the discount moved over the year; a bigger
                  discount at the end is the good direction. */}
              {line.firstDiscountPercent != null &&
                line.discountPercent != null &&
                Math.abs(line.discountPercent - line.firstDiscountPercent) >
                  0.005 && (
                  <span
                    className={cn(
                      "block text-[11px] tabular-nums",
                      line.discountPercent > line.firstDiscountPercent
                        ? "text-emerald-700/80 dark:text-emerald-400/80"
                        : "text-red-600/80 dark:text-red-400/80",
                    )}
                  >
                    {formatNumber(line.firstDiscountPercent, 1)} →{" "}
                    {formatNumber(line.discountPercent, 1)}%
                  </span>
                )}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatPrice(line.total)}
            </TableCell>
            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
              {formatDate(line.lastBoughtAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>

      <ProductHistoryDialog
        target={target}
        year={year}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
