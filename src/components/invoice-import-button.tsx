"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, ReceiptTextIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runInvoiceImport } from "@/app/imports/actions";

// Invoices are fetched in batches, so one run stays inside the hosting time
// limit; pressing again continues with the rest.
export function InvoiceImportButton({ remaining }: { remaining?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await runInvoiceImport();
      if (!result.ok) {
        toast.error("Invoice import failed", { description: result.error });
        return;
      }
      toast.success(
        `${result.imported} invoices read${result.remaining > 0 ? `, ${result.remaining} to go` : ""}`,
        {
          description: `${result.lines} invoice lines · ${result.openOrders} open orders refreshed`,
        }
      );
      router.refresh();
    });
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : <ReceiptTextIcon />}
      {pending ? "Reading invoices…" : "Import invoices & orders"}
      {!pending && remaining ? ` (${remaining})` : ""}
    </Button>
  );
}
