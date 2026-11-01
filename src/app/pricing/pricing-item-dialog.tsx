"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AssortmentCategory,
  PricingCategory,
  SalePriceChange,
} from "@/db/schema";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import {
  advicePrice,
  portionCost,
  portionsPerUnit,
  roundPrice,
} from "@/lib/pricing/calc";
import { parseContents } from "@/lib/pricing/contents";
import type { PricingRow } from "@/lib/pricing/queries";
import { loadSalePriceHistory, savePricingItem } from "./actions";

export type PricingDialogState =
  { mode: "create" } | { mode: "edit"; itemId: number };

const NONE = "none";
const DEFAULT_VAT = "default";
const VAT_RATES = [0, 0.09, 0.21];

// Form values are typed text; these turn them back into numbers.
const parse = (text: string) => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};
const show = (value: number | null | undefined, factor = 1) =>
  value == null ? "" : String(Number((value * factor).toFixed(4)));

export function PricingItemDialog({
  state,
  item,
  categories,
  orderCategories,
  priceRounding,
  onClose,
}: {
  state: PricingDialogState | null;
  item: PricingRow | null;
  categories: PricingCategory[];
  orderCategories: AssortmentCategory[];
  priceRounding: number;
  onClose: () => void;
}) {
  const open = state !== null && (state.mode === "create" || item !== null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {state && (state.mode === "create" || item) && (
          <PricingItemForm
            key={state.mode === "edit" ? `item-${state.itemId}` : "new"}
            item={state.mode === "edit" ? item : null}
            categories={categories}
            orderCategories={orderCategories}
            priceRounding={priceRounding}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PricingItemForm({
  item,
  categories,
  orderCategories,
  priceRounding,
  onClose,
}: {
  item: PricingRow | null;
  categories: PricingCategory[];
  orderCategories: AssortmentCategory[];
  priceRounding: number;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [orderCategoryId, setOrderCategoryId] = useState(
    String(orderCategories[0]?.id ?? ""),
  );
  const [pricingCategoryId, setPricingCategoryId] = useState(
    item?.pricingCategoryId ? String(item.pricingCategoryId) : NONE,
  );
  const [notForSale, setNotForSale] = useState(item?.notForSale ?? false);
  const [manualPrice, setManualPrice] = useState(
    show(item?.manualPurchasePrice),
  );
  const [source, setSource] = useState(item?.purchaseSource ?? "");
  const [unitVolume, setUnitVolume] = useState(show(item?.unitVolume));
  // Portions are entered in cl, percentages as percentages.
  const [portionVolume, setPortionVolume] = useState(
    show(item?.portionVolume, 100),
  );
  const [portions, setPortions] = useState(show(item?.portionsPerUnitOverride));
  const [alcohol, setAlcohol] = useState(show(item?.alcoholPercentage, 100));
  const [vat, setVat] = useState(
    item?.vatRateOverride != null ? String(item.vatRateOverride) : DEFAULT_VAT,
  );
  const [pending, startTransition] = useTransition();

  const category = categories.find(
    (candidate) => String(candidate.id) === pricingCategoryId,
  );
  const suggestion = parseContents(item?.supplierDescription ?? null);
  const hasSuggestion =
    suggestion.unitVolume != null ||
    suggestion.count != null ||
    suggestion.alcoholPercentage != null;

  const portionVolumeLiters = parse(portionVolume);
  const alcoholFraction = parse(alcohol);
  const input = {
    purchasePrice: parse(manualPrice) ?? item?.catalogPrice ?? null,
    unitVolume: parse(unitVolume),
    portionVolume:
      portionVolumeLiters != null ? portionVolumeLiters / 100 : null,
    portionsPerUnit: parse(portions),
    vatRate: vat === DEFAULT_VAT ? null : Number(vat),
    alcoholPercentage: alcoholFraction != null ? alcoholFraction / 100 : null,
  };
  const computedPortions = portionsPerUnit({ ...input, portionsPerUnit: null });
  const cost = category ? portionCost(input, category) : null;
  const advice = category && cost != null ? advicePrice(cost, category) : null;

  function applySuggestion() {
    if (suggestion.unitVolume != null)
      setUnitVolume(show(suggestion.unitVolume));
    // A crate of small bottles is sold per bottle; a keg, a bottle of
    // spirits or a crate of liter bottles needs a portion size from you.
    if (
      suggestion.packVolume != null &&
      suggestion.packVolume <= 0.5 &&
      suggestion.count != null
    ) {
      setPortionVolume(show(suggestion.packVolume, 100));
      setPortions("");
    } else if (suggestion.unitVolume == null && suggestion.count != null) {
      setPortions(String(suggestion.count));
    }
    if (suggestion.alcoholPercentage != null) {
      setAlcohol(show(suggestion.alcoholPercentage, 100));
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await savePricingItem({
        id: item?.id,
        name: item ? undefined : name,
        orderCategoryId: item ? undefined : Number(orderCategoryId),
        pricingCategoryId: category ? category.id : null,
        notForSale,
        unitVolume: input.unitVolume,
        portionVolume: input.portionVolume,
        portionsPerUnit: input.portionsPerUnit,
        alcoholPercentage: input.alcoholPercentage,
        vatRate: input.vatRate,
        manualPurchasePrice: parse(manualPrice),
        purchaseSource: source.trim() || null,
      });
      if (result.ok) {
        toast.success(item ? "Saved" : "Item added");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {item ? item.name : "Item from another supplier"}
        </DialogTitle>
        <DialogDescription>
          {item
            ? (item.supplierDescription ??
              item.purchaseSource ??
              "Not linked to a Rust Food product.")
            : "For what we buy somewhere other than Rust Food. It also shows on the order page, to order by hand."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        {!item && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pricing-name">Name</Label>
              <Input
                id="pricing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wisselwhisky"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Order category</Label>
              <Select
                items={orderCategories.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                }))}
                value={orderCategoryId}
                onValueChange={(value) => setOrderCategoryId(String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Pricing category</Label>
            <Select
              items={[
                { value: NONE, label: "None" },
                ...categories.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                })),
              ]}
              value={pricingCategoryId}
              onValueChange={(value) => setPricingCategoryId(String(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>VAT</Label>
            <Select
              items={[
                {
                  value: DEFAULT_VAT,
                  label: `Category (${formatPercent(category?.vatRate)})`,
                },
                ...VAT_RATES.map((rate) => ({
                  value: String(rate),
                  label: formatPercent(rate),
                })),
              ]}
              value={vat}
              onValueChange={(value) => setVat(String(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_VAT}>
                  Category ({formatPercent(category?.vatRate)})
                </SelectItem>
                {VAT_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {formatPercent(rate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={notForSale}
            onCheckedChange={(checked) => setNotForSale(checked === true)}
          />
          Not for sale (we only buy it, like sugar or toilet paper)
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pricing-purchase">Purchase price</Label>
            <Input
              id="pricing-purchase"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              inputMode="decimal"
              placeholder={
                item?.catalogPrice != null
                  ? String(item.catalogPrice)
                  : "per unit, excl. VAT"
              }
            />
            <p className="text-xs text-muted-foreground">
              {item?.catalogPrice != null
                ? `Empty uses Rust's ${formatPrice(item.catalogPrice)} per ${item.unitOfMeasure?.toLowerCase() ?? "unit"}.`
                : "Per purchase unit, excluding VAT."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pricing-source">Bought at (optional)</Label>
            <Input
              id="pricing-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Gall & Gall"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Contents</p>
            {hasSuggestion && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={applySuggestion}
                title="Read from the supplier's description"
              >
                <SparklesIcon />
                From description
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="pricing-unit" className="text-xs">
                Unit (L)
              </Label>
              <Input
                id="pricing-unit"
                value={unitVolume}
                onChange={(e) => setUnitVolume(e.target.value)}
                inputMode="decimal"
                placeholder="4.8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pricing-portion" className="text-xs">
                Portion (cl)
              </Label>
              <Input
                id="pricing-portion"
                value={portionVolume}
                onChange={(e) => setPortionVolume(e.target.value)}
                inputMode="decimal"
                placeholder="20"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pricing-portions" className="text-xs">
                Portions
              </Label>
              <Input
                id="pricing-portions"
                value={portions}
                onChange={(e) => setPortions(e.target.value)}
                inputMode="decimal"
                placeholder={
                  computedPortions != null
                    ? String(Number(computedPortions.toFixed(2)))
                    : "24"
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pricing-alcohol" className="text-xs">
                Alcohol (%)
              </Label>
              <Input
                id="pricing-alcohol"
                value={alcohol}
                onChange={(e) => setAlcohol(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Portions follow from unit and portion size; fill them in yourself
            for what isn&apos;t poured, like crisps.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Cost / portion</p>
            <p className="font-medium tabular-nums">{formatPrice(cost)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Advice</p>
            <p className="font-medium tabular-nums">
              {advice != null
                ? formatPrice(roundPrice(advice, priceRounding))
                : "—"}
            </p>
          </div>
          {item && (
            <div>
              <p className="text-xs text-muted-foreground">Current price</p>
              <p className="font-medium tabular-nums">
                {formatPrice(item.salePrice)}
              </p>
            </div>
          )}
        </div>

        {item && <PriceHistory itemId={item.id} />}

        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {item ? "Save" : "Add item"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function PriceHistory({ itemId }: { itemId: number }) {
  const [history, setHistory] = useState<SalePriceChange[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSalePriceHistory(itemId).then((result) => {
      if (cancelled) return;
      if (result.ok) setHistory(result.data);
      else toast.error(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Price history</p>
      {history == null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No changes yet.</p>
      ) : (
        <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border text-xs">
          {history.map((change) => (
            <li
              key={change.id}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 tabular-nums"
            >
              <span className="text-muted-foreground">
                {formatDate(change.createdAt)}
              </span>
              <span>
                {formatPrice(change.oldPrice)} → {formatPrice(change.newPrice)}
              </span>
              <span className="text-muted-foreground">
                cost {formatPrice(change.cost)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
