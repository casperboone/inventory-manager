import Link from "next/link";
import { ImportButton } from "@/components/import-button";
import { ImportStatusBadge } from "@/components/import-status-badge";
import { SyncStatusLine } from "@/components/sync-status-line";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupplierImport } from "@/db/schema";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import {
  getImports,
  getSyncStatus,
  type SyncStatus,
} from "@/lib/products/queries";
import { IMPORT_KIND_LABELS } from "@/lib/supplier/import-runs";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The imports and the cart calls run as server actions from this page, so they
// get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Imports · Inventory Manager" };

export default async function ImportsPage() {
  const [imports, catalog, documents] = await Promise.all([
    getImports(),
    getSyncStatus("catalog"),
    getSyncStatus("documents"),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="text-sm text-muted-foreground">
          What comes in from Rust Food, and every run that fetched it.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ImportSource
          title="Catalog"
          description="All products and their prices, and what changed."
          status={catalog}
        />
        <ImportSource
          title="Documents"
          description="Invoices and credit notes in batches, plus open orders and what is outstanding."
          status={documents}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-16">#</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
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
                <TableCell>{IMPORT_KIND_LABELS[run.kind]}</TableCell>
                <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                <TableCell>
                  <ImportStatusBadge run={run} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(run.startedAt, run.finishedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {runResult(run)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ImportSource({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: SyncStatus;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4">
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <SyncStatusLine status={status} className="mt-1" />
      </div>
      <ImportButton kind={status.kind} running={status.running} />
    </div>
  );
}

// The kinds count different things, so one sentence says what each run did. A
// count is left out when the run never got that far.
function runResult(run: SupplierImport) {
  const parts =
    run.kind === "documents"
      ? [
          counted(run.invoicesCount, "invoices"),
          run.creditMemosCount ? counted(run.creditMemosCount, "credit notes") : null,
          counted(run.linesCount, "lines"),
          counted(run.openOrdersCount, "open orders"),
          counted(run.openEntriesCount, "outstanding"),
          run.remainingCount ? counted(run.remainingCount, "to go") : null,
        ]
      : [
          run.fetchedCount != null && run.fetchedCount !== run.reportedCount
            ? `${formatNumber(run.fetchedCount)} / ${formatNumber(run.reportedCount)} products`
            : counted(run.fetchedCount, "products"),
          counted(run.newCount, "new"),
          counted(run.priceChangedCount, "price changes"),
          counted(run.removedCount, "removed"),
        ];
  return parts.filter(Boolean).join(" · ") || "—";
}

function counted(value: number | null, label: string) {
  return value == null ? null : `${formatNumber(value)} ${label}`;
}
