import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { getDocument } from "@/lib/products/documents";
import { DocumentLines, DocumentTypeBadge } from "../../document-lines";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/financials/invoices/[documentNo]">
) {
  const { documentNo } = await props.params;
  return { title: `${decodeURIComponent(documentNo)} · Inventory Manager` };
}

export default async function InvoicePage(
  props: PageProps<"/financials/invoices/[documentNo]">
) {
  const { documentNo } = await props.params;
  const document = await getDocument(decodeURIComponent(documentNo));
  if (!document || document.header.documentType === "order") notFound();

  const { header, lines, totals } = document;

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/financials/invoices" />}
      >
        <ArrowLeftIcon />
        All invoices
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {header.documentNo}
        </h1>
        <DocumentTypeBadge type={header.documentType} />
        <span className="text-sm text-muted-foreground">
          {formatDate(header.documentDate)} · {formatNumber(lines.length)} lines
        </span>
      </div>

      <DocumentLines lines={lines} />

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
        {totals.discount > 0.005 && (
          <span className="text-muted-foreground">
            Line discount saved {formatPrice(totals.discount)}
          </span>
        )}
        <span>
          Total excl. VAT{" "}
          <strong className="tabular-nums">
            {formatPrice(header.amount ?? totals.lines)}
          </strong>
        </span>
      </div>
    </div>
  );
}
