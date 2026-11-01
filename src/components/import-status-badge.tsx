import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SupplierImport } from "@/db/schema";
import { formatNumber } from "@/lib/format";
import { isRunActive } from "@/lib/supplier/import-runs";

export function ImportStatusBadge({ run }: { run: SupplierImport }) {
  if (isRunActive(run)) {
    return <Badge variant="secondary">Running</Badge>;
  }
  // Still "running" but past its time: it crashed and no later run has come
  // along yet to say so.
  if (run.status !== "succeeded") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge variant="destructive">Failed</Badge>
        </TooltipTrigger>
        <TooltipContent>
          {run.error ?? (run.status === "running" ? "Timed out" : "Unknown error")}
        </TooltipContent>
      </Tooltip>
    );
  }
  if (run.remainingCount) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge variant="outline">Partial</Badge>
        </TooltipTrigger>
        <TooltipContent>
          {formatNumber(run.remainingCount)} documents left for the next run
        </TooltipContent>
      </Tooltip>
    );
  }
  const partial =
    run.fetchedCount != null &&
    run.reportedCount != null &&
    run.fetchedCount < run.reportedCount;
  return partial ? (
    <Badge variant="outline">Partial</Badge>
  ) : (
    <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400">
      Succeeded
    </Badge>
  );
}
