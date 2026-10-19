import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
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
  formatDateTime,
  formatPrice,
  formatShortDate,
} from "@/lib/format";
import { getOpenEntries } from "@/lib/products/open-entries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outstanding · Inventory Manager" };

export default async function OutstandingPage() {
  const { entries, outstanding, overdue, refreshedAt } = await getOpenEntries();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outstanding</h1>
        <p className="text-sm text-muted-foreground">
          What the supplier is still waiting for, and the credit notes that
          have not been settled against it. Amounts include VAT. Refreshed
          with every document import.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">Still to pay</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatPrice(outstanding)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border bg-background p-4",
            overdue > 0 && "border-destructive/40"
          )}
        >
          <p className="text-xs text-muted-foreground">Past its due date</p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              overdue > 0 && "text-destructive"
            )}
          >
            {formatPrice(overdue)}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">Open documents</p>
          <p className="text-2xl font-semibold tabular-nums">
            {entries.length}
          </p>
          {refreshedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Checked {formatDateTime(refreshedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table className="text-xs [&_td]:px-1.5 [&_th]:px-1.5 sm:text-sm sm:[&_td]:px-2 sm:[&_th]:px-2">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-20 sm:w-24">Date</TableHead>
              <TableHead>Number</TableHead>
              <TableHead className="hidden sm:table-cell">Order</TableHead>
              <TableHead className="w-24 sm:w-28">Due</TableHead>
              <TableHead className="w-24 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nothing outstanding. Import the documents to check again.
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => (
              <TableRow key={entry.documentNo} className="relative">
                <TableCell className="whitespace-nowrap">
                  <span className="sm:hidden">
                    {formatShortDate(entry.documentDate)}
                  </span>
                  <span className="hidden sm:inline">
                    {formatDate(entry.documentDate)}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {/* The document itself, if we imported it already. */}
                  <Link
                    href={`/financials/invoices/${encodeURIComponent(entry.documentNo)}`}
                    className="underline-offset-2 hover:underline after:absolute after:inset-0"
                  >
                    {entry.documentNo}
                  </Link>
                  {entry.documentType === "creditmemo" && (
                    <Badge variant="outline" className="ml-2 hidden sm:inline-flex">
                      credit note
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                  {entry.orderNo ?? ""}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {entry.daysOverdue ? (
                    <span className="inline-flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangleIcon className="size-3.5" />
                      {entry.daysOverdue}d late
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      <span className="sm:hidden">
                        {formatShortDate(entry.dueDate)}
                      </span>
                      <span className="hidden sm:inline">
                        {formatDate(entry.dueDate)}
                      </span>
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    (entry.remainingAmount ?? 0) < 0 && "text-muted-foreground"
                  )}
                >
                  {formatPrice(entry.remainingAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
