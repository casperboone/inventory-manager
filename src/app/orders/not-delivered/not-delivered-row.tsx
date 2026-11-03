"use client";

import { useTransition } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format";
import { reorderShortage, setResolution } from "../actions";
import { LineStatusBadge } from "../status";

export function NotDeliveredRow({
  row,
}: {
  row: {
    lineId: number;
    name: string;
    itemNo: string | null;
    ordered: number;
    got: number;
    shortBy: number;
    status: "short" | "missing";
    orderId: number;
    orderLabel: string;
    sentAt: Date | null;
  };
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{row.name}</div>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
            {row.itemNo && <span>{row.itemNo}</span>}
            <Link
              href={`/orders/${row.orderId}`}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {row.orderLabel}
            </Link>
            <span>Sent {formatDate(row.sentAt)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg leading-tight font-semibold tabular-nums">
            {formatNumber(row.got)} / {formatNumber(row.ordered)}
          </div>
          <LineStatusBadge status={row.status} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => reorderShortage(row.lineId, row.shortBy))
          }
        >
          <PlusIcon />
          Add {formatNumber(row.shortBy)} to current order
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setResolution(row.lineId, "accepted"))}
        >
          Accept
        </Button>
      </div>
    </li>
  );
}
