import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  LinkIcon,
} from "lucide-react";
import { DiscountBadge } from "@/components/discount-badge";
import { ItemImage } from "@/components/item-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import { getItemDetail, getItemName, type ItemLink } from "@/lib/items/queries";
import { signalChips } from "@/lib/pricing/signals";
import type { DiscountStatus } from "@/lib/products/discount-types";
import { cn } from "@/lib/utils";
import { PurchaseDocumentTable } from "@/app/financials/purchase-history/purchase-document-table";
import { SalePriceHistoryList } from "@/app/pricing/sale-price-history";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 1,
});

function parseId(id: string) {
  return /^\d+$/.test(id) ? Number(id) : null;
}

export async function generateMetadata(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const itemId = parseId(id);
  const name = itemId ? await getItemName(itemId) : null;
  return { title: `${name ?? "Item"} · Inventory Manager` };
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/50 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

// Where this section's fields get edited.
function EditLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {children}
      <ArrowRightIcon className="size-3" />
    </Link>
  );
}

function Facts({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {children}
    </dl>
  );
}

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words tabular-nums">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ItemList({ items }: { items: ItemLink[] }) {
  return items.map((item, index) => (
    <span key={item.id}>
      {index > 0 && ", "}
      <Link
        href={`/items/${item.id}`}
        className="font-medium underline underline-offset-2"
      >
        {item.label}
      </Link>
    </span>
  ));
}

export default async function ItemPage(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const itemId = parseId(id);
  const detail = itemId ? await getItemDetail(itemId) : null;
  if (!detail) notFound();

  const { item, orderCategory, product, pricing } = detail;
  const { row } = pricing;
  const removed = product?.removedAt != null;
  const unit = product?.unitOfMeasure?.toLowerCase() ?? "units";

  return (
    <div className="space-y-4 pb-12">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/assortment" />}
      >
        <ArrowLeftIcon />
        Assortment
      </Button>

      <div className="flex items-start gap-3">
        <ItemImage
          itemId={item.id}
          itemNo={row.itemNo}
          hasOwnImage={row.hasOwnImage}
          imageStatus={row.imageStatus}
          alt={row.supplierDescription ?? item.name}
          size={64}
        />
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {item.name}
          </h1>
          <p className="text-sm break-words text-muted-foreground">
            {orderCategory}
            {product && ` · ${product.description}`}
          </p>
          <div className="flex flex-wrap gap-1.5 empty:hidden">
            {item.archivedAt && (
              <Badge variant="secondary">
                Archived {formatDate(item.archivedAt)}
              </Badge>
            )}
            {item.notForSale && <Badge variant="secondary">Not for sale</Badge>}
            {!product && (
              <Badge variant="outline" className="gap-1 text-amber-700">
                <AlertTriangleIcon className="size-3" />
                Not linked
              </Badge>
            )}
            {removed && <Badge variant="outline">Gone from catalog</Badge>}
          </div>
        </div>
      </div>

      {/* Side by side only once the invoice table fits in half the page. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Section
            title="Ordering"
            action={<EditLink href="/assortment">Order list</EditLink>}
          >
            <Facts>
              <Fact label="Target">
                {item.target != null ? `${item.target} ${unit}` : "—"}
              </Fact>
              <Fact label="To buy">
                {item.quantityToBuy > 0
                  ? `${item.quantityToBuy} ${unit}`
                  : "Nothing"}
              </Fact>
              <Fact label="Order category">{orderCategory}</Fact>
              {item.note && (
                <Fact label="Note" className="col-span-full">
                  {item.note}
                </Fact>
              )}
            </Facts>
            {(!product || removed) && (
              <Muted>
                {removed
                  ? "Rust Food no longer lists this, so it can't go in the cart and is ordered by hand."
                  : "Not linked to a Rust Food product, so it can't go in the cart and is ordered by hand."}
              </Muted>
            )}
          </Section>

          <PricingSection detail={detail} />
        </div>

        <div className="space-y-4">
          <SupplierSection detail={detail} />
          <PurchasesSection detail={detail} unit={unit} />
        </div>
      </div>
    </div>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof getItemDetail>>>;

function PricingSection({ detail }: { detail: Detail }) {
  const { pricing, salePriceHistory } = detail;
  const { row, category, reference } = pricing;
  const chips = signalChips(row, {
    name: reference?.name,
    alcoholPrice: reference?.alcoholPrice ?? null,
  });

  return (
    <Section
      title="Pricing"
      action={<EditLink href="/pricing">Pricing screen</EditLink>}
    >
      <Facts>
        <Fact label="Sale price">{formatPrice(row.salePrice)}</Fact>
        <Fact label="Cost per portion">{formatPrice(row.cost)}</Fact>
        <Fact label="Advice">{formatPrice(row.adviceRounded)}</Fact>
        <Fact
          label="Margin"
          className={cn(row.signals.lowMargin && "text-destructive")}
        >
          {formatPercent(row.margin)}
        </Fact>
        <Fact label="Profit per portion">{formatPrice(row.profit)}</Fact>
        <Fact label="Pricing category">{category?.name ?? "—"}</Fact>
        <Fact label="Purchase price">
          {formatPrice(row.purchasePrice)}
          {row.manualPurchasePrice != null && row.catalogPrice != null && (
            <span className="block text-xs font-normal text-muted-foreground">
              Rust {formatPrice(row.catalogPrice)}
            </span>
          )}
        </Fact>
        <Fact label="Portions per unit">
          {row.portions != null ? numberFormat.format(row.portions) : "—"}
        </Fact>
        <Fact label="VAT">{formatPercent(row.vatRate)}</Fact>
        {row.alcoholPrice != null && (
          <Fact
            label="Per 10 ml alcohol"
            className={cn(
              row.signals.cheapAlcohol && "text-amber-700 dark:text-amber-400",
            )}
          >
            {formatPrice(row.alcoholPrice)}
          </Fact>
        )}
        {row.purchaseSource && (
          <Fact label="Bought at">{row.purchaseSource}</Fact>
        )}
      </Facts>

      {/* The tooltips of the pricing screen don't work on a phone, so what the
          signals mean is written out. Nothing to flag on what we don't sell. */}
      {row.notForSale ? (
        <Muted>Not for sale, so there is no price to check.</Muted>
      ) : (
        chips.length > 0 && (
          <ul className="space-y-1.5">
            {chips.map((chip) => (
              <li
                key={chip.key}
                className={cn(
                  "flex gap-2 rounded px-2 py-1.5 text-sm",
                  chip.tone === "bad"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-medium">{chip.label}.</span>{" "}
                  {chip.detail}
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      <div className="space-y-1.5">
        <h3 className="text-sm font-medium">Sale price history</h3>
        {salePriceHistory.length === 0 ? (
          <Muted>No changes yet.</Muted>
        ) : (
          <SalePriceHistoryList history={salePriceHistory} />
        )}
      </div>
    </Section>
  );
}

function PurchasesSection({ detail, unit }: { detail: Detail; unit: string }) {
  const { product, purchases, lastPaid, sharedWith, pricing } = detail;
  const { bought } = pricing.row;
  const { thisYear, lastYear } = pricing.years;

  return (
    <Section title="Purchases">
      {!product ? (
        <Muted>
          {pricing.row.purchaseSource
            ? `Bought at ${pricing.row.purchaseSource}, so there are no Rust Food invoices for it.`
            : "Not linked to a Rust Food product, so we can't tell which invoice lines are for this item."}
        </Muted>
      ) : (
        <>
          {sharedWith.length > 0 && (
            <p className="flex gap-2 rounded bg-muted px-2 py-1.5 text-sm">
              <LinkIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Shared history: these invoices are for the supplier product,
                which <ItemList items={sharedWith} /> uses as well. They don&apos;t
                say which item a line was bought for.
              </span>
            </p>
          )}
          <Facts>
            <Fact label="Last price paid">
              {formatPrice(lastPaid?.netUnitPrice)}
              {lastPaid && (
                <span className="block text-xs font-normal text-muted-foreground">
                  <Link
                    href={`/financials/invoices/${encodeURIComponent(lastPaid.documentNo)}`}
                    className="hover:underline"
                  >
                    {formatDate(lastPaid.documentDate)}
                  </Link>
                </span>
              )}
            </Fact>
            <Fact label={`Bought in ${thisYear}`}>
              {numberFormat.format(bought.thisYear?.units ?? 0)} {unit}
            </Fact>
            <Fact label={`Bought in ${lastYear}`}>
              {numberFormat.format(bought.lastYear?.units ?? 0)} {unit}
            </Fact>
          </Facts>
          {purchases.length === 0 ? (
            <Muted>Not on any invoice yet.</Muted>
          ) : (
            <>
              {/* Edge to edge on a phone, where every pixel counts. */}
              <PurchaseDocumentTable
                lines={purchases}
                className="-mx-3 rounded-none border-x-0 sm:mx-0 sm:rounded-lg sm:border-x"
              />
              <p className="text-xs text-muted-foreground">
                {purchases.length} invoice lines, newest first. Prices are per
                unit, after discount and excluding VAT.
              </p>
            </>
          )}
        </>
      )}
    </Section>
  );
}

function DiscountDetail({
  status,
  unitPrice,
}: {
  status: DiscountStatus;
  unitPrice: number | null;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <DiscountBadge status={status} unitPrice={unitPrice} />
      {/* Spelled out as well, because a tooltip doesn't work on a phone. */}
      <span className="text-xs font-normal text-muted-foreground">
        {status.kind === "unknown" && "Never ordered, so unknown."}
        {status.kind === "none" &&
          `On the last ${status.documentType === "order" ? "order" : "invoice"} (${formatDate(status.invoicedAt)}).`}
        {status.kind === "discount" &&
          `${formatPrice(status.discount.amountPerUnit)} per unit, on the last ${status.discount.documentType === "order" ? "order" : "invoice"} (${formatDate(status.discount.invoicedAt)}).`}
      </span>
    </span>
  );
}

function SupplierSection({ detail }: { detail: Detail }) {
  const { product, priceChanges, discount, sharedWith } = detail;

  if (!product) {
    return (
      <Section title="Supplier">
        <Muted>
          Not linked to a Rust Food product. Link one in the{" "}
          <Link
            href="/assortment"
            className="underline underline-offset-2 hover:text-foreground"
          >
            order list
          </Link>{" "}
          if they sell it.
        </Muted>
      </Section>
    );
  }

  // Removed products are hidden from the catalog unless you ask for them.
  const catalogHref = `/products?q=${encodeURIComponent(product.itemNo)}&status=all`;

  return (
    <Section
      title="Supplier"
      action={<EditLink href={catalogHref}>Catalog</EditLink>}
    >
      {product.removedAt && (
        <p className="flex gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Gone from the Rust Food catalog since{" "}
            {formatDate(product.removedAt)}
            {product.removedInImportId && (
              <>
                {" "}
                (
                <Link
                  href={`/imports/${product.removedInImportId}`}
                  className="underline underline-offset-2"
                >
                  import #{product.removedInImportId}
                </Link>
                )
              </>
            )}
            . The price and details below are the last ones we saw.
          </span>
        </p>
      )}

      <Facts>
        <Fact label="Description" className="col-span-full">
          {product.description}
          {product.description2 && (
            <span className="block text-xs font-normal text-muted-foreground">
              {product.description2}
            </span>
          )}
        </Fact>
        <Fact label="Item no.">
          <span className="font-mono text-sm">{product.itemNo}</span>
        </Fact>
        <Fact label="Unit">{product.unitOfMeasure ?? "—"}</Fact>
        <Fact label="Catalog price">{formatPrice(product.unitPrice)}</Fact>
        {product.gtin && (
          <Fact label="GTIN">
            <span className="font-mono text-sm">{product.gtin}</span>
          </Fact>
        )}
        <Fact label="In Rust assortment">
          {product.inSupplierAssortment ? "Yes" : "No"}
        </Fact>
        {discount && (
          <Fact label="Line discount" className="col-span-full">
            <DiscountDetail status={discount} unitPrice={product.unitPrice} />
          </Fact>
        )}
        {sharedWith.length > 0 && (
          <Fact label="Also linked to" className="col-span-full">
            <span className="font-normal">
              <ItemList items={sharedWith} />
            </span>
          </Fact>
        )}
      </Facts>

      <div className="space-y-1.5">
        <h3 className="text-sm font-medium">Catalog price changes</h3>
        {priceChanges.length === 0 ? (
          <Muted>No changes seen in our imports.</Muted>
        ) : (
          <ul className="divide-y rounded-lg border text-xs">
            {priceChanges.map((change) => (
              <li
                key={change.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 tabular-nums"
              >
                <span className="text-muted-foreground">
                  {formatDate(change.createdAt)}
                </span>
                <span>
                  {formatPrice(change.oldPrice)} →{" "}
                  {formatPrice(change.newPrice)}
                </span>
                <Link
                  href={`/imports/${change.importId}`}
                  className="text-muted-foreground hover:underline"
                >
                  import #{change.importId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
