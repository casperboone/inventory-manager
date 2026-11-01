// Imports posted invoices for their line discounts ("regelkorting").
//
//   npm run supplier:invoices                 a batch of 40
//   npm run supplier:invoices -- --batch 200  a bigger run
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : undefined;
}

async function main() {
  const { importSupplierInvoices } = await import(
    "@/lib/supplier/import-invoices"
  );
  const result = await importSupplierInvoices({ batch: arg("batch") });
  console.log(
    `Imported ${result.imported} invoices (${result.lines} lines), refreshed ${result.openOrders} open orders and ${result.openEntries} outstanding documents. ${result.remaining} of ${result.total} still to go.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
