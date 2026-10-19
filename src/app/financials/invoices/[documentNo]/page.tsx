import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format";
import { getDocument } from "@/lib/products/documents";
import { DocumentLines, DocumentTypeBadge } from "../../document-lines";
import { DocumentMeta, DocumentTotals } from "../../document-meta";

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

  const { header, lines, totals, orderLinked } = document;

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
        {/* The supplier's own PDF, fetched with our session. */}
        <Button
          variant="outline"
          size="sm"
          className="sm:ml-auto"
          nativeButton={false}
          render={
            <a
              href={`/api/documents/${encodeURIComponent(header.documentNo)}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <FileTextIcon />
          PDF
        </Button>
      </div>

      <DocumentMeta header={header} orderLinked={orderLinked} />

      <DocumentLines lines={lines} />

      <DocumentTotals header={header} totals={totals} label="Total excl. VAT" />
    </div>
  );
}
