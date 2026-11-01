"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, Loader2Icon, ReceiptTextIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runInvoiceImport, runSupplierImport } from "@/app/imports/actions";

// The two imports stay separate requests: the catalog alone takes most of the
// hosting time limit, so one server action could not run both.
export function ImportButton({
  kind,
  running,
}: {
  kind: "catalog" | "documents";
  running: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // An import started elsewhere (another tab, or before navigating away)
  // keeps running on the server; poll until it is done.
  useEffect(() => {
    if (!running || pending) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [running, pending, router]);

  async function importCatalog() {
    const result = await runSupplierImport();
    if (result.ok) {
      toast.success("Import finished");
      router.push(`/imports/${result.importId}`);
    } else {
      toast.error("Import failed", { description: result.error });
    }
  }

  // Invoices are fetched in batches, so one run stays inside the hosting time
  // limit; pressing again continues with the rest.
  async function importDocuments() {
    const result = await runInvoiceImport();
    if (!result.ok) {
      toast.error("Invoice import failed", { description: result.error });
      return;
    }
    toast.success(
      `${result.imported} invoices read${result.remaining > 0 ? `, ${result.remaining} to go` : ""}`,
      {
        description: `${result.creditMemos} credit notes · ${result.lines} lines · ${result.openOrders} open orders · ${result.openEntries} outstanding`,
      }
    );
    router.refresh();
  }

  const busy = pending || running;
  if (kind === "catalog") {
    return (
      <Button onClick={() => startTransition(importCatalog)} disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
        {busy ? "Importing…" : "Import products"}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      onClick={() => startTransition(importDocuments)}
      disabled={busy}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <ReceiptTextIcon />}
      {busy ? "Reading invoices…" : "Import invoices & orders"}
    </Button>
  );
}
