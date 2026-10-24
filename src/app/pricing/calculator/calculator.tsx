"use client";

import { useState } from "react";
import { RotateCcwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PricingCategory } from "@/db/schema";
import { formatPercent, formatPrice } from "@/lib/format";
import {
  advicePrice,
  alcoholPrice,
  margin,
  portionCost,
  portionsPerUnit,
  priceTone,
  roundPrice,
} from "@/lib/pricing/calc";
import { parseContents } from "@/lib/pricing/contents";
import { cn } from "@/lib/utils";

const DEFAULT_VAT = "default";
const VAT_RATES = [0, 0.09, 0.21];

const parse = (text: string) => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};
const show = (value: number | null, factor = 1) =>
  value == null ? "" : String(Number((value * factor).toFixed(4)));

// Tries out a price without touching the assortment: what would this cost
// per portion, what does the model advise, and what does my price earn.
export function Calculator({
  categories,
  rounding,
  reference,
}: {
  categories: PricingCategory[];
  rounding: number;
  reference: { name: string; alcoholPrice: number | null } | null;
}) {
  const [categoryId, setCategoryId] = useState(String(categories[0]?.id ?? ""));
  const [purchasePrice, setPurchasePrice] = useState("");
  const [vat, setVat] = useState(DEFAULT_VAT);
  const [description, setDescription] = useState("");
  const [unitVolume, setUnitVolume] = useState("");
  const [portionVolume, setPortionVolume] = useState("");
  const [portions, setPortions] = useState("");
  const [alcohol, setAlcohol] = useState("");
  const [salePrice, setSalePrice] = useState("");

  const category = categories.find((c) => String(c.id) === categoryId);
  const parsedDescription = parseContents(description || null);
  const canReadDescription =
    parsedDescription.unitVolume != null ||
    parsedDescription.count != null ||
    parsedDescription.alcoholPercentage != null;

  const portionLiters = parse(portionVolume);
  const alcoholPercent = parse(alcohol);
  const input = {
    purchasePrice: parse(purchasePrice),
    unitVolume: parse(unitVolume),
    portionVolume: portionLiters != null ? portionLiters / 100 : null,
    portionsPerUnit: parse(portions),
    vatRate: vat === DEFAULT_VAT ? null : Number(vat),
    alcoholPercentage: alcoholPercent != null ? alcoholPercent / 100 : null,
  };
  const vatRate = input.vatRate ?? category?.vatRate ?? 0;
  const computedPortions = portionsPerUnit({ ...input, portionsPerUnit: null });
  const allPortions = portionsPerUnit(input);
  const sellable =
    allPortions != null && category
      ? allPortions * (1 - category.wastage)
      : null;
  const cost = category ? portionCost(input, category) : null;
  const advice = category && cost != null ? advicePrice(cost, category) : null;
  const adviceRounded = advice != null ? roundPrice(advice, rounding) : null;

  // How the advice splits over the two margins.
  const atBase =
    category && cost != null ? cost / (1 - category.baseMargin) : null;
  const abovePivot =
    category && atBase != null && atBase > category.pivotPrice
      ? { costPart: (atBase - category.pivotPrice) * (1 - category.baseMargin) }
      : null;

  const sale = parse(salePrice);
  const saleMargin = sale && cost != null ? margin(sale, cost) : null;
  const saleTone = priceTone(sale, advice);
  const saleAlcohol =
    sale != null
      ? alcoholPrice(sale, input.alcoholPercentage, input.portionVolume)
      : null;
  const adviceAlcohol =
    adviceRounded != null
      ? alcoholPrice(
          adviceRounded,
          input.alcoholPercentage,
          input.portionVolume,
        )
      : null;

  function readDescription() {
    const contents = parsedDescription;
    if (contents.unitVolume != null) setUnitVolume(show(contents.unitVolume));
    if (
      contents.packVolume != null &&
      contents.packVolume <= 0.5 &&
      contents.count != null
    ) {
      setPortionVolume(show(contents.packVolume, 100));
      setPortions("");
    } else if (contents.unitVolume == null && contents.count != null) {
      setPortions(String(contents.count));
    }
    if (contents.alcoholPercentage != null) {
      setAlcohol(show(contents.alcoholPercentage, 100));
    }
  }

  function reset() {
    setPurchasePrice("");
    setVat(DEFAULT_VAT);
    setDescription("");
    setUnitVolume("");
    setPortionVolume("");
    setPortions("");
    setAlcohol("");
    setSalePrice("");
  }

  const vatItems = [
    {
      value: DEFAULT_VAT,
      label: `Category (${formatPercent(category?.vatRate)})`,
    },
    ...VAT_RATES.map((rate) => ({
      value: String(rate),
      label: formatPercent(rate),
    })),
  ];

  return (
    <div className="space-y-4 pb-24 lg:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calculator</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Try a price for something new before it is in the assortment.
            Nothing here is saved.
          </p>
        </div>
        <Button variant="outline" onClick={reset}>
          <RotateCcwIcon />
          Clear
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Pricing category</Label>
              <Select
                items={categories.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                }))}
                value={categoryId}
                onValueChange={(value) => setCategoryId(String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {category && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatPercent(category.baseMargin, 1)} up to{" "}
                  {formatPrice(category.pivotPrice)}, then{" "}
                  {formatPercent(category.premiumMargin, 1)} ·{" "}
                  {formatPercent(category.wastage)} loss
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">VAT</Label>
              <Select
                items={vatItems}
                value={vat}
                onValueChange={(value) => setVat(String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vatItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Field
            id="calc-purchase"
            label="Purchase price"
            hint="Per purchase unit (crate, keg, bottle), excluding VAT."
            suffix="€"
            value={purchasePrice}
            onChange={setPurchasePrice}
            placeholder="15,70"
            autoFocus
          />

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Contents</p>
            <div className="space-y-1">
              <Label htmlFor="calc-description" className="text-xs">
                Supplier description (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="calc-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="COCA COLA REGULAR KRAT 24/20CL"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={readDescription}
                  disabled={!canReadDescription}
                  title="Fill in the contents from the description"
                >
                  <SparklesIcon />
                  Read
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field
                id="calc-unit"
                label="Unit"
                suffix="L"
                value={unitVolume}
                onChange={setUnitVolume}
                placeholder="4.8"
              />
              <Field
                id="calc-portion"
                label="Portion"
                suffix="cl"
                value={portionVolume}
                onChange={setPortionVolume}
                placeholder="20"
              />
              <Field
                id="calc-portions"
                label="Portions"
                value={portions}
                onChange={setPortions}
                placeholder={
                  computedPortions != null
                    ? String(Number(computedPortions.toFixed(2)))
                    : "24"
                }
              />
              <Field
                id="calc-alcohol"
                label="Alcohol"
                suffix="%"
                value={alcohol}
                onChange={setAlcohol}
                placeholder="0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Portions follow from unit and portion size; fill them in yourself
              for what isn&apos;t poured, like crisps.
            </p>
          </div>

          <Field
            id="calc-sale"
            label="Your price (optional)"
            hint="Per portion, including VAT, to see what it earns."
            suffix="€"
            value={salePrice}
            onChange={setSalePrice}
            placeholder={adviceRounded != null ? show(adviceRounded) : "2,00"}
            className={cn(
              saleTone === "above" &&
                "border-green-600/30 bg-green-100 dark:bg-green-500/20",
              saleTone === "below" &&
                "border-red-600/30 bg-red-100 dark:bg-red-500/20",
            )}
          />
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <section className="overflow-hidden rounded-lg border bg-background">
            <header className="border-b bg-muted/50 px-3 py-2">
              <h2 className="text-sm font-semibold">Advice</h2>
            </header>
            <div className="space-y-3 p-3">
              <div>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatPrice(adviceRounded)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {advice != null
                    ? `Unrounded ${advice.toFixed(3)} · ${formatPercent(margin(adviceRounded!, cost!))} margin · ${formatPrice(adviceRounded! - cost!)} profit`
                    : "Fill in a purchase price and the contents."}
                </p>
              </div>

              <dl className="space-y-1.5 text-sm">
                <Row label="Purchase incl. VAT">
                  {input.purchasePrice != null
                    ? formatPrice(input.purchasePrice * (1 + vatRate))
                    : "—"}
                </Row>
                <Row label="Sellable portions">
                  {sellable != null
                    ? `${Number(sellable.toFixed(1))}${category?.wastage ? ` of ${Number(allPortions!.toFixed(1))}` : ""}`
                    : "—"}
                </Row>
                <Row label="Cost per portion" strong>
                  {formatPrice(cost)}
                </Row>
              </dl>

              {category && atBase != null && (
                <div className="space-y-1 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground tabular-nums">
                  {abovePivot ? (
                    <>
                      <p>
                        Up to the pivot: {formatPrice(category.pivotPrice)} at{" "}
                        {formatPercent(category.baseMargin, 1)}
                      </p>
                      <p>
                        The other {formatPrice(abovePivot.costPart)} of cost at{" "}
                        {formatPercent(category.premiumMargin, 1)}: +
                        {formatPrice(advice! - category.pivotPrice)}
                      </p>
                    </>
                  ) : (
                    <p>
                      Below the pivot ({formatPrice(category.pivotPrice)}), so
                      all of it at {formatPercent(category.baseMargin, 1)}.
                    </p>
                  )}
                </div>
              )}

              {adviceAlcohol != null && (
                <p className="text-xs text-muted-foreground">
                  At the advice, 10 ml of alcohol costs{" "}
                  {formatPrice(adviceAlcohol)}
                  {reference?.alcoholPrice != null &&
                    ` (${reference.name}: ${formatPrice(reference.alcoholPrice)})`}
                  .
                </p>
              )}
            </div>
          </section>

          {sale != null && (
            <section className="overflow-hidden rounded-lg border bg-background">
              <header className="border-b bg-muted/50 px-3 py-2">
                <h2 className="text-sm font-semibold">
                  At {formatPrice(sale)}
                </h2>
              </header>
              <dl className="space-y-1.5 p-3 text-sm">
                <Row label="Margin">
                  <span
                    className={cn(
                      category &&
                        saleMargin != null &&
                        saleMargin < category.premiumMargin &&
                        "font-medium text-destructive",
                    )}
                  >
                    {formatPercent(saleMargin)}
                  </span>
                </Row>
                <Row label="Profit per portion">
                  {cost != null ? formatPrice(sale - cost) : "—"}
                </Row>
                <Row label="Profit per unit">
                  {cost != null && sellable != null
                    ? formatPrice((sale - cost) * sellable)
                    : "—"}
                </Row>
                <Row label="Compared to advice">
                  <span
                    className={cn(
                      saleTone === "above" &&
                        "text-green-700 dark:text-green-400",
                      saleTone === "below" && "text-destructive",
                    )}
                  >
                    {adviceRounded != null
                      ? `${sale >= adviceRounded ? "+" : "−"}${formatPrice(Math.abs(sale - adviceRounded))}`
                      : "—"}
                  </span>
                </Row>
                {saleAlcohol != null && (
                  <Row label="Per 10 ml alcohol">
                    <span
                      className={cn(
                        reference?.alcoholPrice != null &&
                          saleAlcohol < reference.alcoholPrice - 0.005 &&
                          "font-medium text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {formatPrice(saleAlcohol)}
                    </span>
                  </Row>
                )}
              </dl>
            </section>
          )}
        </div>
      </div>

      {/* On a phone the results sit below the form; keep the answer in view. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 text-sm tabular-nums">
          <div>
            <p className="text-xs text-muted-foreground">Cost / portion</p>
            <p className="font-medium">{formatPrice(cost)}</p>
          </div>
          {sale != null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className="font-medium">{formatPercent(saleMargin)}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Advice</p>
            <p className="text-lg font-semibold">
              {formatPrice(adviceRounded)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  suffix,
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn("tabular-nums", suffix && "pr-7", className)}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>
        {children}
      </dd>
    </div>
  );
}
