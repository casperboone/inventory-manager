import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supplierInvoices } from "@/db/schema";
import { logger } from "@/lib/logger";
import { fetchDocumentPdf } from "@/lib/supplier/invoice-service";

// The PDF comes from the supplier, who only serves it to a logged-in session,
// so it is fetched with ours and passed straight on. It never changes once
// the document is posted, so the browser may keep it for a day.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/documents/[documentNo]">
) {
  const documentNo = decodeURIComponent((await ctx.params).documentNo).replace(
    /\.pdf$/i,
    ""
  );

  // Only documents we know about, which also rules out odd paths.
  const document = await db.query.supplierInvoices.findFirst({
    where: eq(supplierInvoices.documentNo, documentNo),
    columns: { documentNo: true, documentType: true },
  });
  if (!document || document.documentType === "order") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const pdf = await fetchDocumentPdf(
      document.documentNo,
      document.documentType
    );
    if (!pdf) return new Response("No document", { status: 404 });

    return new Response(pdf.body, {
      headers: {
        "content-type": pdf.contentType,
        // Opens in the browser; saving it keeps the supplier's own name.
        "content-disposition": `inline; filename="${document.documentNo}.pdf"`,
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (error) {
    logger.error(
      `Document PDF ${documentNo}: ${error instanceof Error ? error.message : error}`
    );
    return new Response("Document unavailable", { status: 502 });
  }
}
