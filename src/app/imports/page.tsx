import Link from "next/link";
import { ImportButton } from "@/components/import-button";
import { ImportStatusBadge } from "@/components/import-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { getImports, isImportRunning } from "@/lib/products/queries";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The catalog import and the cart calls run as server actions from this
// page, so they get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Imports · Inventory Manager" };

export default async function ImportsPage() {
  const [imports, importRunning] = await Promise.all([
    getImports(),
    isImportRunning(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
          <p className="text-sm text-muted-foreground">
            Fetches the full Rust Food catalog and records what changed.
          </p>
        </div>
        <ImportButton running={importRunning} />
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-16">#</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">Price changes</TableHead>
              <TableHead className="text-right">Removed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No imports yet.
                </TableCell>
              </TableRow>
            )}
            {imports.map((run) => (
              <TableRow key={run.id} className="relative">
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/imports/${run.id}`}
                    className="after:absolute after:inset-0"
                  >
                    {run.id}
                  </Link>
                </TableCell>
                <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                <TableCell>
                  <ImportStatusBadge run={run} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(run.startedAt, run.finishedAt)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.fetchedCount == null
                    ? "—"
                    : run.fetchedCount === run.reportedCount
                      ? formatNumber(run.fetchedCount)
                      : `${formatNumber(run.fetchedCount)} / ${formatNumber(run.reportedCount)}`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(run.newCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(run.priceChangedCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(run.removedCount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
