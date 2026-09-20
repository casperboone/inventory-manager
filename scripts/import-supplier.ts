// Runs a supplier product import from the command line (same logic as the
// "Import products" button).
//
//   npm run supplier:import                 full catalog
//   npm run supplier:import -- --limit 50   first 50 rows only
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { importSupplierProducts } = await import(
    "@/lib/supplier/import-products"
  );
  const limitIndex = process.argv.indexOf("--limit");
  const limit =
    limitIndex > -1 ? Number(process.argv[limitIndex + 1]) : undefined;
  const id = await importSupplierProducts({ limit });
  console.log(`Import #${id} done.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
