"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runSupplierImport } from "@/app/imports/actions";

export function ImportButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // An import started elsewhere (another tab, or before navigating away)
  // keeps running on the server; poll until it is done.
  useEffect(() => {
    if (!running || pending) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [running, pending, router]);

  function onClick() {
    startTransition(async () => {
      const result = await runSupplierImport();
      if (result.ok) {
        toast.success("Import finished");
        router.push(`/imports/${result.importId}`);
      } else {
        toast.error("Import failed", { description: result.error });
      }
    });
  }

  const busy = pending || running;
  return (
    <Button onClick={onClick} disabled={busy}>
      {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      {busy ? "Importing…" : "Import products"}
    </Button>
  );
}
