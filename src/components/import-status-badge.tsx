import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SupplierImport } from "@/db/schema";

export function ImportStatusBadge({ run }: { run: SupplierImport }) {
  if (run.status === "running") {
    return <Badge variant="secondary">Running</Badge>;
  }
  if (run.status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge variant="destructive">Failed</Badge>
        </TooltipTrigger>
        <TooltipContent>{run.error ?? "Unknown error"}</TooltipContent>
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
