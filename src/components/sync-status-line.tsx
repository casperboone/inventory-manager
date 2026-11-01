import Link from "next/link";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { SyncStatus } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

function runHref(run: { id: number }) {
  return `/imports/${run.id}`;
}

// When this data last came in from the supplier, said the same way wherever
// the data is used. Each state links to the run it is about.
export function SyncStatusLine({
  status,
  className,
}: {
  status: SyncStatus;
  className?: string;
}) {
  const { latest, lastSuccess, running } = status;
  const base = cn("text-sm text-muted-foreground", className);
  const link = "underline-offset-4 hover:underline";

  if (running && latest) {
    return (
      <p className={base}>
        <Link href={runHref(latest)} className={link}>
          Syncing, started {formatDateTime(latest.startedAt)}
        </Link>
      </p>
    );
  }

  const failed = latest && latest.status !== "succeeded" ? latest : undefined;
  const partial =
    lastSuccess &&
    lastSuccess.fetchedCount != null &&
    lastSuccess.reportedCount != null &&
    lastSuccess.fetchedCount < lastSuccess.reportedCount;

  return (
    <p className={base}>
      {lastSuccess ? (
        <Link href={runHref(lastSuccess)} className={link}>
          Last synced {formatDateTime(lastSuccess.finishedAt)}
          {!!lastSuccess.remainingCount &&
            ` · ${formatNumber(lastSuccess.remainingCount)} documents to go`}
          {partial && " · partial"}
        </Link>
      ) : (
        !failed && "No sync logged yet"
      )}
      {failed && (
        <>
          {lastSuccess && " · "}
          <Link
            href={runHref(failed)}
            className={cn(link, "font-medium text-destructive")}
          >
            {lastSuccess ? "latest sync failed" : "Last sync failed"}{" "}
            {formatDateTime(failed.finishedAt ?? failed.startedAt)}
          </Link>
        </>
      )}
    </p>
  );
}
