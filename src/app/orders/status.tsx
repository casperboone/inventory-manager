import { Badge } from "@/components/ui/badge";
import type { LineStatus, OrderStage } from "@/lib/orders/matching";
import { cn } from "@/lib/utils";

const GOOD = "border-emerald-300 text-emerald-700 dark:text-emerald-400";
const BAD = "border-destructive/40 text-destructive";
const ATTENTION = "border-amber-300 text-amber-700 dark:text-amber-400";

const STAGES: Record<OrderStage, { label: string; className?: string }> = {
  in_cart: { label: "In cart" },
  placed: { label: "Placed" },
  partly_invoiced: { label: "Partly invoiced" },
  invoiced: { label: "Invoiced" },
  complete: { label: "Complete", className: GOOD },
};

export function StageBadge({
  stage,
  closed,
}: {
  stage: OrderStage;
  closed?: boolean;
}) {
  if (closed) return <Badge variant="outline">Closed</Badge>;
  const { label, className } = STAGES[stage];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

const LINE_STATUSES: Record<LineStatus, { label: string; className?: string }> =
  {
    delivered: { label: "Delivered", className: GOOD },
    accepted: { label: "Accepted" },
    substituted: { label: "Replaced", className: GOOD },
    by_hand: { label: "Tick off", className: ATTENTION },
    not_sent: { label: "Not sent", className: ATTENTION },
    waiting: { label: "Waiting" },
    short: { label: "Short", className: BAD },
    missing: { label: "Missing", className: BAD },
  };

export function LineStatusBadge({ status }: { status: LineStatus }) {
  const { label, className } = LINE_STATUSES[status];
  return (
    <Badge variant="outline" className={cn("shrink-0", className)}>
      {label}
    </Badge>
  );
}

export const CONFIDENCE_LABELS = {
  high: "Very likely",
  medium: "Possibly",
  low: "Unlikely, but it shares something",
} as const;

export const DOCUMENT_TYPE_LABELS = {
  order: "Rust order",
  invoice: "Invoice",
  creditmemo: "Credit note",
} as const;
