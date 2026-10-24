"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  ArrowLeftIcon,
  CheckIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ItemImage } from "@/components/item-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AssortmentCategory, PricingCategory } from "@/db/schema";
import { formatPercent, formatPrice } from "@/lib/format";
import type {
  MissingField,
  PricingOverview,
  PricingRow,
} from "@/lib/pricing/queries";
import { cn } from "@/lib/utils";
import { setSalePrice } from "./actions";
import {
  PricingItemDialog,
  type PricingDialogState,
} from "./pricing-item-dialog";

type View = "all" | "attention" | "notForSale";

const MISSING_LABELS: Record<MissingField, string> = {
  category: "pricing category",
  purchasePrice: "purchase price",
  portions: "portions",
  salePrice: "sale price",
};

function needsAttention(row: PricingRow) {
  const { missing, belowAdvice, lowMargin, costChanged, cheapAlcohol } =
    row.signals;
  return (
    missing.length > 0 ||
    belowAdvice ||
    lowMargin ||
    costChanged ||
    cheapAlcohol
  );
}

export function PricingTable({
  overview,
  orderCategories,
}: {
  overview: PricingOverview;
  orderCategories: AssortmentCategory[];
}) {
  const { rows, categories, reference, years } = overview;
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<PricingDialogState | null>(null);

  const forSale = rows.filter((row) => !row.notForSale);
  const attentionCount = forSale.filter(needsAttention).length;
  const notForSaleCount = rows.length - forSale.length;

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = rows.filter((row) => {
      if (view === "notForSale" ? !row.notForSale : row.notForSale)
        return false;
      if (view === "attention" && !needsAttention(row)) return false;
      if (!query) return true;
      return [row.name, row.supplierDescription, row.purchaseSource]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(query));
    });

    // Grouped like the order page, which is how you find things; the
    // pricing category is shown per row instead. Rows arrive in that order.
    const result: { id: number; name: string; rows: PricingRow[] }[] = [];
    for (const row of visible) {
      let group = result.find((g) => g.id === row.orderCategoryId);
      if (!group) {
        group = {
          id: row.orderCategoryId,
          name: row.orderCategoryName,
          rows: [],
        };
        result.push(group);
      }
      group.rows.push(row);
    }
    return result;
  }, [rows, view, search]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const dialogItem =
    dialog?.mode === "edit"
      ? (rows.find((row) => row.id === dialog.itemId) ?? null)
      : null;

  return (
    <div className="pb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prices</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Advice is the cost per portion marked up with the category&apos;s
            base margin up to its pivot price, and with the premium margin above
            it, rounded to {formatPrice(overview.settings.priceRounding)}.
            Prices include VAT.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <PlusIcon />
          Other supplier item
        </Button>
      </div>

      <div className="sticky top-0 z-20 -mx-4 mb-2 space-y-2 bg-muted/30 px-4 pt-1 pb-2 backdrop-blur">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item…"
            className="bg-background pl-8"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          <ViewTab current={view} value="all" onSelect={setView}>
            For sale ({forSale.length})
          </ViewTab>
          <ViewTab current={view} value="attention" onSelect={setView}>
            Needs attention ({attentionCount})
          </ViewTab>
          <ViewTab current={view} value="notForSale" onSelect={setView}>
            Not for sale ({notForSaleCount})
          </ViewTab>
        </div>
      </div>

      {groups.length === 0 && (
        <p className="rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          {view === "attention"
            ? "Nothing needs attention."
            : "No items found."}
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <section
            key={group.id}
            className="overflow-hidden rounded-lg border bg-background"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/50 px-3 py-2">
              <h2 className="text-sm font-semibold">{group.name}</h2>
              <p className="text-xs text-muted-foreground">
                {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
              </p>
            </header>
            <div className="overflow-x-auto">
              {/* Fixed widths, so the columns line up across categories. */}
              <table className="w-full table-fixed text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-1.5 text-left font-medium">Item</th>
                    <th className="hidden w-20 px-2 py-1.5 text-right font-medium md:table-cell">
                      Purchase
                    </th>
                    <th className="hidden w-16 px-2 py-1.5 text-right font-medium sm:table-cell">
                      Cost
                    </th>
                    <th className="w-16 px-2 py-1.5 text-right font-medium">
                      Advice
                    </th>
                    <th className="w-32 px-2 py-1.5 text-left font-medium">
                      Price
                    </th>
                    <th className="hidden w-16 px-2 py-1.5 text-right font-medium sm:table-cell">
                      Margin
                    </th>
                    <th className="hidden w-16 px-2 py-1.5 text-right font-medium lg:table-cell">
                      Profit
                    </th>
                    <th
                      className="hidden w-20 px-2 py-1.5 text-right font-medium lg:table-cell"
                      title="Price of 10 ml pure alcohol"
                    >
                      /10 ml alc.
                    </th>
                    <th
                      className="hidden w-20 px-2 py-1.5 text-right font-medium md:table-cell"
                      title={`Portions bought in ${years.thisYear} so far, from the invoices`}
                    >
                      {years.thisYear} YTD
                    </th>
                    <th
                      className="hidden w-20 px-3 py-1.5 text-right font-medium md:table-cell"
                      title={`Portions bought in ${years.lastYear}, from the invoices`}
                    >
                      {years.lastYear}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.rows.map((row) => (
                    <PricingTableRow
                      key={row.id}
                      row={row}
                      pricingCategory={
                        row.pricingCategoryId != null
                          ? categoryById.get(row.pricingCategoryId)
                          : undefined
                      }
                      referenceName={reference?.name}
                      referenceAlcoholPrice={reference?.alcoholPrice ?? null}
                      onEdit={() => setDialog({ mode: "edit", itemId: row.id })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <PricingItemDialog
        state={dialog}
        item={dialogItem}
        categories={categories}
        orderCategories={orderCategories}
        priceRounding={overview.settings.priceRounding}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function PricingTableRow({
  row,
  pricingCategory,
  referenceName,
  referenceAlcoholPrice,
  onEdit,
}: {
  row: PricingRow;
  pricingCategory?: PricingCategory;
  referenceName?: string;
  referenceAlcoholPrice: number | null;
  onEdit: () => void;
}) {
  const { signals } = row;
  return (
    <tr className="align-middle">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <ItemImage
            itemId={row.id}
            itemNo={row.itemNo}
            hasOwnImage={row.hasOwnImage}
            imageStatus={row.imageStatus}
            alt={row.name}
            size={32}
            className="hidden sm:flex"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <button
                type="button"
                onClick={onEdit}
                className="text-left font-medium underline-offset-2 hover:underline"
              >
                {row.name}
              </button>
              {pricingCategory && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" />
                    }
                  >
                    <BanknoteIcon className="size-3" />
                    {pricingCategory.name}
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatPercent(pricingCategory.baseMargin, 1)} up to{" "}
                    {formatPrice(pricingCategory.pivotPrice)}, then{" "}
                    {formatPercent(pricingCategory.premiumMargin, 1)} ·{" "}
                    {formatPercent(pricingCategory.wastage)} loss · VAT{" "}
                    {formatPercent(row.vatRate)}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {row.purchaseSource ?? row.supplierDescription ?? "Not at Rust"}
              {row.portions != null &&
                ` · ${Number(row.portions.toFixed(1))} portions`}
            </p>
            <Signals
              row={row}
              referenceName={referenceName}
              referenceAlcoholPrice={referenceAlcoholPrice}
            />
          </div>
        </div>
      </td>
      <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">
        {formatPrice(row.purchasePrice)}
        {row.manualPurchasePrice != null && row.catalogPrice != null && (
          <p className="text-xs text-muted-foreground">
            Rust {formatPrice(row.catalogPrice)}
          </p>
        )}
      </td>
      <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
        {formatPrice(row.cost)}
      </td>
      <td
        className="px-2 py-2 text-right tabular-nums"
        title={
          row.advice != null ? `Unrounded ${row.advice.toFixed(3)}` : undefined
        }
      >
        {formatPrice(row.adviceRounded)}
      </td>
      <td className="px-2 py-2">
        <PriceInput row={row} />
      </td>
      <td
        className={cn(
          "hidden px-2 py-2 text-right tabular-nums sm:table-cell",
          signals.lowMargin && "font-medium text-destructive",
        )}
      >
        {formatPercent(row.margin)}
      </td>
      <td className="hidden px-2 py-2 text-right tabular-nums lg:table-cell">
        {formatPrice(row.profit)}
      </td>
      <td
        className={cn(
          "hidden px-2 py-2 text-right tabular-nums lg:table-cell",
          signals.cheapAlcohol &&
            "font-medium text-amber-700 dark:text-amber-400",
        )}
      >
        {row.alcoholPrice != null ? formatPrice(row.alcoholPrice) : ""}
      </td>
      <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">
        <Bought value={row.bought.thisYear} unit={row.unitOfMeasure} />
      </td>
      <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">
        <Bought value={row.bought.lastYear} unit={row.unitOfMeasure} />
      </td>
    </tr>
  );
}

const portionFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 0,
});
const unitFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 1,
});

// Portions bought, with the purchase units underneath; just the units when
// the item doesn't know its portions yet.
function Bought({
  value,
  unit,
}: {
  value: PricingRow["bought"]["thisYear"];
  unit: string | null;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const units = `${unitFormat.format(value.units)} ${unit?.toLowerCase() ?? "units"}`;
  if (value.portions == null) {
    return <span className="text-muted-foreground">{units}</span>;
  }
  return (
    <>
      {portionFormat.format(value.portions)}
      <p className="text-xs text-muted-foreground">{units}</p>
    </>
  );
}

function Signals({
  row,
  referenceName,
  referenceAlcoholPrice,
}: {
  row: PricingRow;
  referenceName?: string;
  referenceAlcoholPrice: number | null;
}) {
  const { signals } = row;
  const chips: {
    key: string;
    label: string;
    detail: string;
    tone: "warn" | "bad";
  }[] = [];

  if (signals.missing.length > 0) {
    chips.push({
      key: "missing",
      label: "Missing data",
      detail: `No ${signals.missing.map((field) => MISSING_LABELS[field]).join(", ")} yet.`,
      tone: "warn",
    });
  }
  if (signals.lowMargin) {
    chips.push({
      key: "margin",
      label: "Low margin",
      detail: "The margin is below the category's premium margin.",
      tone: "bad",
    });
  }
  if (
    signals.belowAdvice &&
    row.salePrice != null &&
    row.adviceRounded != null
  ) {
    chips.push({
      key: "advice",
      label: `−${formatPrice(row.adviceRounded - row.salePrice)} vs advice`,
      detail: `Advice is ${formatPrice(row.adviceRounded)}.`,
      tone: "warn",
    });
  }
  if (signals.costChanged && row.cost != null && row.salePriceCost != null) {
    const diff = row.cost - row.salePriceCost;
    chips.push({
      key: "cost",
      label: `Cost ${diff > 0 ? "up" : "down"} ${formatPrice(Math.abs(diff))}`,
      detail: `A portion cost ${formatPrice(row.salePriceCost)} when the price was set, now ${formatPrice(row.cost)}. Save the price again to accept.`,
      tone: diff > 0 ? "bad" : "warn",
    });
  }
  if (signals.cheapAlcohol) {
    chips.push({
      key: "alcohol",
      label: "Cheap alcohol",
      detail: `10 ml of alcohol costs ${formatPrice(row.alcoholPrice)}, less than ${referenceName} (${formatPrice(referenceAlcoholPrice)}).`,
      tone: "warn",
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((chip) => (
        <Tooltip key={chip.key}>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                  chip.tone === "bad"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              />
            }
          >
            <AlertTriangleIcon className="size-3" />
            {chip.label}
          </TooltipTrigger>
          <TooltipContent>{chip.detail}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

const display = (value: number | null) =>
  value == null ? "" : value.toFixed(2).replace(".", ",");

// As in the old sheet: green when the price is clearly above the unrounded
// advice, red when it is clearly below, and no colour within the margin.
const PRICE_TONE_MARGIN = 0.125;

function priceTone(row: PricingRow) {
  if (row.salePrice == null || row.advice == null) return null;
  if (row.salePrice > row.advice + PRICE_TONE_MARGIN) return "above";
  if (row.salePrice < row.advice - PRICE_TONE_MARGIN) return "below";
  return null;
}

function PriceInput({ row }: { row: PricingRow }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const value = draft ?? display(row.salePrice);

  function save(price: number | null) {
    startTransition(async () => {
      const result = await setSalePrice(row.id, price);
      if (result.ok) setDraft(null);
      else toast.error(`${row.name}: ${result.error}`);
    });
  }

  function commit() {
    if (draft == null) return;
    const text = draft.trim().replace(",", ".");
    if (text === "") {
      if (row.salePrice == null) setDraft(null);
      else save(null);
      return;
    }
    const price = Number(text);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("That is not a price.");
      setDraft(null);
      return;
    }
    if (Math.round(price * 100) / 100 === row.salePrice) setDraft(null);
    else save(price);
  }

  const tone = priceTone(row);

  const canUseAdvice =
    row.adviceRounded != null &&
    Math.abs(row.adviceRounded - (row.salePrice ?? -1)) >= 0.005;

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        inputMode="decimal"
        placeholder="—"
        aria-label={`Price of ${row.name}`}
        disabled={pending}
        title={
          tone === "above"
            ? "Above the advice"
            : tone === "below"
              ? "Below the advice"
              : undefined
        }
        className={cn(
          "h-7 w-16 px-1.5 text-right tabular-nums",
          tone === "above" &&
            "border-green-600/30 bg-green-100 dark:bg-green-500/20",
          tone === "below" && "border-red-600/30 bg-red-100 dark:bg-red-500/20",
        )}
      />
      {canUseAdvice && (
        <Button
          variant="ghost"
          size="icon-sm"
          title={`Use advice (${formatPrice(row.adviceRounded)})`}
          aria-label={`Use advice for ${row.name}`}
          disabled={pending}
          onClick={() => save(row.adviceRounded)}
        >
          <ArrowLeftIcon />
        </Button>
      )}
      {row.signals.costChanged && row.salePrice != null && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Keep this price at the new cost"
          aria-label={`Keep the price of ${row.name}`}
          disabled={pending}
          onClick={() => save(row.salePrice)}
        >
          <CheckIcon />
        </Button>
      )}
    </div>
  );
}

function ViewTab({
  current,
  value,
  onSelect,
  children,
}: {
  current: View;
  value: View;
  onSelect: (view: View) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
        current === value
          ? "bg-background font-medium shadow-xs ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
