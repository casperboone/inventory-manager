"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PurchaseDocumentLine } from "@/lib/products/purchases";
import { loadProductHistory } from "./actions";
import { PurchaseDocumentTable } from "./purchase-document-table";

export type ProductHistoryTarget = { itemNo: string; description: string };

// Every document a product appears on, so you can see how its price and
// discount moved rather than just the year's summary.
export function ProductHistoryDialog({
  target,
  year,
  onClose,
}: {
  target: ProductHistoryTarget | null;
  year: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-3 sm:max-w-2xl sm:p-4">
        {target && (
          // Remounting per product starts it fresh, without the previous
          // product's rows or its "all years" choice.
          <ProductHistory key={target.itemNo} target={target} year={year} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductHistory({
  target,
  year,
}: {
  target: ProductHistoryTarget;
  year: string;
}) {
  const [lines, setLines] = useState<PurchaseDocumentLine[] | null>(null);
  const [allYears, setAllYears] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await loadProductHistory(
        target.itemNo,
        allYears ? undefined : year,
      );
      if (result.ok) setLines(result.lines);
      else toast.error(result.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allYears]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{target.description}</DialogTitle>
        <DialogDescription>
          Item {target.itemNo} ·{" "}
          {allYears ? "every document" : `documents in ${year}`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lines ? `${lines.length} documents` : "Loading…"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAllYears((value) => !value)}
          disabled={pending}
        >
          {pending && <Loader2Icon className="animate-spin" />}
          {allYears ? `Only ${year}` : "All years"}
        </Button>
      </div>

      <PurchaseDocumentTable lines={lines} />
    </>
  );
}
