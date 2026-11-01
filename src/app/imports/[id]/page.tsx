import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { ImportStatusBadge } from "@/components/import-status-badge";
import { isOnOurList } from "@/components/item-links";
import { ProductsTable } from "@/components/products-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPrice,
} from "@/lib/format";
import { getItemLinksByItemNo } from "@/lib/items/queries";
import { getImport, getImportChanges } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/imports/[id]">) {
  const { id } = await props.params;
  return { title: `Import #${id} · Inventory Manager` };
}

export default async function ImportPage(props: PageProps<"/imports/[id]">) {
  const { id } = await props.params;
  const onlyOurs = (await props.searchParams).list === "1";
  const run = await getImport(Number(id));
  if (!run) notFound();

  const [changes, items] = await Promise.all([
    getImportChanges(run.id),
    getItemLinksByItemNo(),
  ]);
  const onList = (product: { itemNo: string }) =>
    isOnOurList(items.get(product.itemNo));
  const ours = {
    newProducts: changes.newProducts.filter(onList),
    priceChanges: changes.priceChanges.filter((c) => onList(c.product)),
    removed: changes.removed.filter(onList),
  };
  const { newProducts, priceChanges, removed } = onlyOurs ? ours : changes;
  const oursCount =
    ours.newProducts.length + ours.priceChanges.length + ours.removed.length;
  const priceByProduct = new Map(
    priceChanges.map((change) => [change.product.id, change])
  );

  // "8 of 94" while narrowed, so what was left out stays visible.
  const tabCount = (shown: unknown[], total: unknown[]) =>
    onlyOurs ? `${shown.length} of ${total.length}` : total.length;

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="new">
              New ({tabCount(newProducts, changes.newProducts)})
            </TabsTrigger>
            <TabsTrigger value="prices">
              Price changes ({tabCount(priceChanges, changes.priceChanges)})
            </TabsTrigger>
            <TabsTrigger value="removed">
              Removed ({tabCount(removed, changes.removed)})
            </TabsTrigger>
          </TabsList>
          {/* A soft navigation, so the open tab stays open. */}
          <Button
            variant={onlyOurs ? "secondary" : "outline"}
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={onlyOurs ? `/imports/${run.id}` : `/imports/${run.id}?list=1`}
                scroll={false}
              />
            }
          >
            {onlyOurs && <XIcon />}
            Only on our list ({oursCount})
          </Button>
        </div>
        <TabsContent value="new" className="mt-3">
          <ProductsTable
            products={newProducts}
            items={items}
            emptyMessage={
              onlyOurs
                ? "None of the new products in this import are on our list."
                : "No new products in this import."
            }
          />
        </TabsContent>
        <TabsContent value="prices" className="mt-3">
          <ProductsTable
            products={priceChanges.map((change) => change.product)}
            items={items}
            emptyMessage={
              onlyOurs
                ? "None of the price changes in this import are on our list."
                : "No price changes in this import."
            }
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
            items={items}
            emptyMessage={
              onlyOurs
                ? "None of the products removed in this import are on our list."
                : "No products were removed from the catalog in this import."
            }
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
