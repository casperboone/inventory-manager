// Fetches a small sample of the supplier catalog and writes the raw response
// to data/probe.json, to inspect the response format without a full import.
//
//   npm run supplier:probe -- [length] [start]
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { writeFileSync } from "node:fs";
import { AuthService } from "@/lib/supplier/auth-service";
import { CatalogService } from "@/lib/supplier/catalog-service";
import { HttpClient } from "@/lib/supplier/http-client";

async function main() {
  const length = Number(process.argv[2] ?? 5);
  const start = Number(process.argv[3] ?? 0);
  const http = new HttpClient();
  await new AuthService(http).authenticate();
  const page = await new CatalogService(http).fetchPage(start, length);
  writeFileSync("data/probe.json", JSON.stringify(page, null, 2));
  console.log(`Wrote ${page.data.length} rows to data/probe.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
