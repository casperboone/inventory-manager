import { z } from "zod";
import { supplierConfig } from "./config";
import type { HttpClient } from "./http-client";
import {
  getSupplierSession,
  isLoginRedirect,
  resetSupplierSession,
} from "./session";

// Invoices are the only place the supplier shows the line discount
// ("regelkorting"): the catalog, the cart and open orders all quote the gross
// price. So the discount per product is learned from what we were invoiced.
const INVOICE_COLUMNS = ["Document_Date", "Document_No", "Amount"];
const PAUSE_BETWEEN_INVOICES_MS = 250;

const invoiceRowSchema = z.looseObject({
  Document_No: z.string().trim().min(1),
  // dd-mm-yyyy
  Document_Date: z.string().nullish(),
  Amount: z.string().nullish(),
});

const invoiceLineSchema = z.looseObject({
  No: z.string().trim().nullish(),
  Description: z.string().nullish(),
  Quantity: z.string().nullish(),
  Unit_Price: z.string().nullish(),
  // e.g. "17.59%"
  Line_Discount_Percent: z.string().nullish(),
  Amount: z.string().nullish(),
});

export type InvoiceHeader = {
  documentNo: string;
  documentDate: Date | null;
  amount: number | null;
};

export type InvoiceLine = {
  itemNo: string;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  discountPercent: number | null;
  amount: number | null;
};

function parseDutchDate(value: string | null | undefined): Date | null {
  const match = value?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(String(value).replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

// The document endpoints answer 500 (or an error page) unless their own page
// has been loaded in the same session first, so each session visits it once.
const INVOICES_PAGE = "/Document/PostedDocuments/PostedInvoices";
const ORDERS_PAGE = "/Document/OpenOrders";
const primed = new WeakMap<HttpClient, Set<string>>();

async function ensurePrimed(http: HttpClient, page: string) {
  const pages = primed.get(http) ?? new Set<string>();
  primed.set(http, pages);
  if (pages.has(page)) return;
  const response = await http.get(page, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    referer: `${supplierConfig.baseUrl}/`,
  });
  if (response.ok) pages.add(page);
}

async function requestJson(
  path: string,
  init?: { body?: URLSearchParams; page?: string },
  retry = true
): Promise<unknown> {
  const session = getSupplierSession();
  const http = await session;
  await ensurePrimed(http, init?.page ?? INVOICES_PAGE);

  const response = init?.body
    ? await http.postForm(path, init.body, {
        accept: "application/json, text/javascript, */*; q=0.01",
        origin: supplierConfig.baseUrl,
        referer: `${supplierConfig.baseUrl}${init?.page ?? INVOICES_PAGE}`,
        "x-requested-with": "XMLHttpRequest",
      })
    : await http.get(path, {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${supplierConfig.baseUrl}${init?.page ?? INVOICES_PAGE}`,
        "x-requested-with": "XMLHttpRequest",
      });

  if (isLoginRedirect(response)) {
    resetSupplierSession(session);
    primed.delete(http);
    if (retry) return requestJson(path, init, false);
    throw new Error("Supplier session could not be re-established.");
  }
  if (!response.ok) {
    throw new Error(`Supplier answered ${response.status} for ${path}.`);
  }

  const text = await response.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(`Expected JSON from ${path} but got a page.`);
  }
  return JSON.parse(text);
}

// The invoice overview, newest first.
export async function fetchInvoiceList(
  start: number,
  length: number
): Promise<{ invoices: InvoiceHeader[]; total: number }> {
  const payload = new URLSearchParams();
  payload.set("draw", "1");
  INVOICE_COLUMNS.forEach((name, index) => {
    payload.set(`columns[${index}][data]`, name);
    payload.set(`columns[${index}][name]`, "");
    payload.set(`columns[${index}][searchable]`, "true");
    payload.set(`columns[${index}][orderable]`, "true");
    payload.set(`columns[${index}][search][value]`, "");
    payload.set(`columns[${index}][search][regex]`, "false");
  });
  payload.set("order[0][column]", "0");
  payload.set("order[0][dir]", "desc");
  payload.set("start", String(start));
  payload.set("length", String(length));
  payload.set("search[value]", "");
  payload.set("search[regex]", "false");

  const body = (await requestJson(
    "/Document/GetPostedDocuments/PostedInvoices",
    { body: payload }
  )) as { data?: unknown[]; recordsTotal?: number };

  const invoices = (body.data ?? []).flatMap((row) => {
    const parsed = invoiceRowSchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        documentNo: parsed.data.Document_No,
        documentDate: parseDutchDate(parsed.data.Document_Date),
        amount: parseNumber(parsed.data.Amount),
      },
    ];
  });

  return { invoices, total: body.recordsTotal ?? invoices.length };
}

export async function fetchInvoiceLines(
  documentNo: string
): Promise<InvoiceLine[]> {
  const body = (await requestJson(
    `/Document/GetPostedDocumentDetails/PostedInvoices/${encodeURIComponent(documentNo)}`
  )) as unknown[];

  return (Array.isArray(body) ? body : []).flatMap((row) => {
    const parsed = invoiceLineSchema.safeParse(row);
    if (!parsed.success || !parsed.data.No) return [];
    return [
      {
        itemNo: parsed.data.No,
        description: parsed.data.Description ?? null,
        quantity: parseNumber(parsed.data.Quantity),
        unitPrice: parseNumber(parsed.data.Unit_Price),
        discountPercent: parseNumber(parsed.data.Line_Discount_Percent),
        amount: parseNumber(parsed.data.Amount),
      },
    ];
  });
}

export async function pauseBetweenInvoices() {
  await new Promise((resolve) =>
    setTimeout(resolve, PAUSE_BETWEEN_INVOICES_MS)
  );
}

const openOrderRowSchema = z.looseObject({
  No: z.string().trim().min(1),
  Order_Date: z.string().nullish(),
  Amount: z.string().nullish(),
});

// Orders placed but not yet invoiced. Their lines already carry the line
// discount and the line total ("regeltotaal").
export async function fetchOpenOrders(): Promise<InvoiceHeader[]> {
  const payload = new URLSearchParams();
  payload.set("draw", "1");
  ["Order_Date", "No", "Amount"].forEach((name, index) => {
    payload.set(`columns[${index}][data]`, name);
    payload.set(`columns[${index}][name]`, "");
    payload.set(`columns[${index}][searchable]`, "true");
    payload.set(`columns[${index}][orderable]`, "true");
    payload.set(`columns[${index}][search][value]`, "");
    payload.set(`columns[${index}][search][regex]`, "false");
  });
  payload.set("order[0][column]", "0");
  payload.set("order[0][dir]", "desc");
  payload.set("start", "0");
  payload.set("length", "100");
  payload.set("search[value]", "");
  payload.set("search[regex]", "false");

  const body = (await requestJson("/Document/GetOpenOrders", {
    body: payload,
    page: ORDERS_PAGE,
  })) as { data?: unknown[] };

  return (body.data ?? []).flatMap((row) => {
    const parsed = openOrderRowSchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        documentNo: parsed.data.No,
        documentDate: parseDutchDate(parsed.data.Order_Date),
        amount: parseNumber(parsed.data.Amount),
      },
    ];
  });
}

export async function fetchOrderLines(
  documentNo: string
): Promise<InvoiceLine[]> {
  const body = (await requestJson(
    `/Document/GetOrderDetails/${encodeURIComponent(documentNo)}`,
    { page: ORDERS_PAGE }
  )) as unknown[];

  return (Array.isArray(body) ? body : []).flatMap((row) => {
    const parsed = invoiceLineSchema.safeParse(row);
    if (!parsed.success || !parsed.data.No) return [];
    return [
      {
        itemNo: parsed.data.No,
        description: parsed.data.Description ?? null,
        quantity: parseNumber(parsed.data.Quantity),
        unitPrice: parseNumber(parsed.data.Unit_Price),
        discountPercent: parseNumber(parsed.data.Line_Discount_Percent),
        // The line total as ordered; net of the discount.
        amount: parseNumber(parsed.data.Amount),
      },
    ];
  });
}
