import { logger } from "@/lib/logger";
import { supplierConfig } from "./config";
import { HttpClient } from "./http-client";

// The catalog endpoint is a jQuery DataTables server-side endpoint. These are
// the columns the webshop's own catalog page requests.
const COLUMNS: { data: string; orderable: boolean }[] = [
  { data: "QuantityHtml", orderable: false },
  { data: "No", orderable: true },
  { data: "Description", orderable: true },
  { data: "SalesUnitOfMeasure", orderable: true },
  { data: "UnitPriceHtml", orderable: false },
  { data: "AssortmentActionHtml", orderable: false },
];

export type CatalogPage = {
  recordsTotal?: number;
  recordsFiltered?: number;
  data: Record<string, unknown>[];
};

export class CatalogService {
  constructor(private readonly httpClient: HttpClient) {}

  async fetchPage(start: number, length: number): Promise<CatalogPage> {
    logger.info(`Catalog fetch started (start=${start}, length=${length}).`);

    const payload = new URLSearchParams();
    payload.set("draw", "1");
    COLUMNS.forEach((column, i) => {
      payload.set(`columns[${i}][data]`, column.data);
      payload.set(`columns[${i}][name]`, "");
      payload.set(`columns[${i}][searchable]`, "true");
      payload.set(`columns[${i}][orderable]`, String(column.orderable));
      payload.set(`columns[${i}][search][value]`, "");
      payload.set(`columns[${i}][search][regex]`, "false");
    });
    // Order by product number so paging is stable between requests.
    payload.set("order[0][column]", "1");
    payload.set("order[0][dir]", "asc");
    payload.set("start", String(start));
    payload.set("length", String(length));
    payload.set("search[value]", "");
    payload.set("search[regex]", "false");

    const response = await this.httpClient.postForm(
      "/Product/getProducts?type=catalog&edit=false",
      payload,
      {
        accept: "application/json, text/javascript, */*; q=0.01",
        origin: supplierConfig.baseUrl,
        referer: `${supplierConfig.baseUrl}/Product/Catalog`,
        "x-requested-with": "XMLHttpRequest",
      }
    );

    if (!response.ok) {
      throw new Error(`Catalog fetch failed with status ${response.status}.`);
    }

    const text = await response.text();
    let body: CatalogPage;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        "Catalog response was not JSON (session may have expired)."
      );
    }

    if (!Array.isArray(body.data)) {
      throw new Error("Catalog response did not contain a data array.");
    }

    logger.info(
      `Catalog fetch returned ${body.data.length} rows (total ${body.recordsTotal ?? "?"}).`
    );
    return body;
  }
}
