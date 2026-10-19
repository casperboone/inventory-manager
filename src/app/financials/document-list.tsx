import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import type { DocumentHeader } from "@/lib/products/documents";
import { DocumentTypeBadge } from "./document-lines";

// A list of documents, shared by the invoices and the orders page.
export function DocumentList({
  documents,
  basePath,
  page,
  pageCount,
  total,
  search,
  showType,
  emptyMessage,
}: {
  documents: DocumentHeader[];
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  search?: string;
  showType?: boolean;
  emptyMessage: string;
}) {
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (next > 1) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="space-y-3">
      {/* A plain form, so searching works without any client-side code. */}
      <form action={basePath} className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search number or product…"
          className="bg-background pl-8"
        />
      </form>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Number</TableHead>
              {showType && (
                <TableHead className="hidden w-32 sm:table-cell">Type</TableHead>
              )}
              <TableHead className="hidden w-20 text-right sm:table-cell">
                Lines
              </TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {documents.map((document) => (
              <TableRow key={document.documentNo} className="relative">
                <TableCell className="whitespace-nowrap">
                  <Link
                    href={`${basePath}/${encodeURIComponent(document.documentNo)}`}
                    className="after:absolute after:inset-0"
                  >
                    {formatDate(document.documentDate)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {document.documentNo}
                </TableCell>
                {showType && (
                  <TableCell className="hidden sm:table-cell">
                    <DocumentTypeBadge type={document.documentType} />
                  </TableCell>
                )}
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                  {formatNumber(document.lineCount)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPrice(document.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {formatNumber(total)} document{total === 1 ? "" : "s"}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              nativeButton={page <= 1}
              render={page > 1 ? <Link href={pageHref(page - 1)} /> : undefined}
            >
              <ChevronLeftIcon />
              Previous
            </Button>
            <span>
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              nativeButton={page >= pageCount}
              render={
                page < pageCount ? <Link href={pageHref(page + 1)} /> : undefined
              }
            >
              Next
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
