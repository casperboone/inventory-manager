import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { ImportStatusBadge } from "@/components/import-status-badge";
import { ProductsTable } from "@/components/products-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPrice,
} from "@/lib/format";
import { getImport, getImportChanges } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/imports/[id]">) {
  const { id } = await props.params;
  return { title: `Import #${id} · Inventory Manager` };
}

export default async function ImportPage(props: PageProps<"/imports/[id]">) {
  const { id } = await props.params;
  const run = await getImport(Number(id));
  if (!run) notFound();

  const { newProducts, priceChanges, removed } = await getImportChanges(run.id);
  const priceByProduct = new Map(
    priceChanges.map((change) => [change.product.id, change])
  );

  const stats = [
    { label: "Products fetched", value: run.fetchedCount },
    { label: "New", value: run.newCount },
    { label: "Updated", value: run.updatedCount },
    { label: "Price changes", value: run.priceChangedCount },
    { label: "Removed", value: run.removedCount },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/imports"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        All imports
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Import #{run.id}
        </h1>
        <ImportStatusBadge run={run} />
        <span className="text-sm text-muted-foreground">
          {formatDateTime(run.startedAt)} ·{" "}
          {formatDuration(run.startedAt, run.finishedAt)}
        </span>
      </div>

      {run.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {run.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardHeader>
              <CardTitle className="text-xs font-normal text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {formatNumber(stat.value)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New ({newProducts.length})</TabsTrigger>
          <TabsTrigger value="prices">
            Price changes ({priceChanges.length})
          </TabsTrigger>
          <TabsTrigger value="removed">Removed ({removed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="mt-3">
          <ProductsTable
            products={newProducts}
            emptyMessage="No new products in this import."
          />
        </TabsContent>
        <TabsContent value="prices" className="mt-3">
          <ProductsTable
            products={priceChanges.map((change) => change.product)}
            emptyMessage="No price changes in this import."
            renderPrice={(product) => {
              const change = priceByProduct.get(product.id);
              if (!change) return formatPrice(product.unitPrice);
              return <PriceChange from={change.oldPrice} to={change.newPrice} />;
            }}
          />
        </TabsContent>
        <TabsContent value="removed" className="mt-3">
          <ProductsTable
            products={removed}
            emptyMessage="No products were removed from the catalog in this import."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PriceChange({ from, to }: { from: number | null; to: number | null }) {
  const pct = from && to != null ? ((to - from) / from) * 100 : null;
  return (
    <div className="flex flex-col items-end">
      <span>{formatPrice(to)}</span>
      <span className="text-xs text-muted-foreground">
        <span className="line-through">{formatPrice(from)}</span>
        {pct != null && (
          <span
            className={cn(
              "ml-1",
              pct > 0 ? "text-red-600" : "text-emerald-600"
            )}
          >
            {pct > 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  );
}
