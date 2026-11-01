import Link from "next/link";
import { ItemLinks } from "@/components/item-links";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatPrice } from "@/lib/format";
import type { ItemLink } from "@/lib/items/queries";
import type { DocumentLine, DocumentType } from "@/lib/products/documents";
import { cn } from "@/lib/utils";

export function DocumentTypeBadge({ type }: { type: DocumentType }) {
  if (type === "creditmemo") {
    return <Badge variant="outline">credit note</Badge>;
  }
  if (type === "order") {
    return <Badge variant="secondary">not invoiced yet</Badge>;
  }
  return <Badge variant="outline">invoice</Badge>;
}

// The lines of one document, shared by invoices and orders since the supplier
// returns them in the same shape.
export function DocumentLines({
  lines,
  items,
}: {
  lines: DocumentLine[];
  // Our own items per item number, for the lines that have one.
  items: Map<string, ItemLink[]>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table className="text-xs [&_td]:px-1.5 [&_th]:px-1.5 sm:text-sm sm:[&_td]:px-2 sm:[&_th]:px-2">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="hidden w-24 sm:table-cell">Item no.</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-12 text-right">Qty</TableHead>
            <TableHead className="w-20 text-right">Price</TableHead>
            <TableHead className="w-16 text-right">Disc.</TableHead>
            <TableHead className="w-20 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-20 text-center text-muted-foreground"
              >
                This document has no lines.
              </TableCell>
            </TableRow>
          )}
          {lines.map((line, index) => (
            <TableRow key={`${line.itemNo}-${index}`}>
              <TableCell className="hidden font-mono text-xs sm:table-cell">
                {/* Jumps to the product in the catalog. */}
                <Link
                  href={`/catalog?q=${encodeURIComponent(line.itemNo)}`}
                  className="hover:underline"
                >
                  {line.itemNo}
                </Link>
              </TableCell>
              <TableCell className="min-w-28 break-words whitespace-normal">
                {line.description ?? line.itemNo}
                <ItemLinks items={items.get(line.itemNo)} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(line.quantity)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(line.netUnitPrice ?? line.unitPrice)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  line.discountPercent
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
                )}
              >
                {line.discountPercent
                  ? `−${formatNumber(line.discountPercent, 1)}%`
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatPrice(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
