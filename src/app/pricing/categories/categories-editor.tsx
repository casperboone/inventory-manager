"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { PricingCategory, PricingSettings } from "@/db/schema";
import { formatPercent, formatPrice } from "@/lib/format";
import { advicePrice, roundPrice } from "@/lib/pricing/calc";
import {
  deletePricingCategory,
  savePricingCategory,
  savePricingSettings,
} from "../actions";

type CategoryWithUsage = PricingCategory & { itemCount: number };

type DialogState = { mode: "create" } | { mode: "edit"; id: number };

const NONE = "none";

// What a few typical portion costs come to, to see what the numbers do.
const SAMPLE_COSTS = [0.25, 0.5, 1, 2];

const parse = (text: string) => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};
// Margins and rates are stored as fractions but typed as percentages.
const percent = (value: number) => String(Number((value * 100).toFixed(2)));
// Pivot prices like 1.875 need their third decimal.
const formatPivot = (value: number) =>
  `€ ${Number(value.toFixed(3)).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`;

export function CategoriesEditor({
  categories,
  settings,
  referenceCandidates,
}: {
  categories: CategoryWithUsage[];
  settings: PricingSettings;
  referenceCandidates: { id: number; name: string }[];
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const editing =
    dialog?.mode === "edit"
      ? categories.find((category) => category.id === dialog.id)
      : undefined;

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Categories &amp; settings
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          How each kind of drink is priced, and the rules that apply to all of
          them.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-lg border bg-background">
          <header className="flex items-center justify-between gap-3 border-b bg-muted/50 px-3 py-2">
            <h2 className="text-sm font-semibold">Pricing categories</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ mode: "create" })}
            >
              <PlusIcon />
              New category
            </Button>
          </header>
          <table className="w-full table-fixed text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-1.5 text-left font-medium">Category</th>
                <th className="hidden w-20 px-2 py-1.5 text-right font-medium sm:table-cell">
                  Base
                </th>
                <th className="hidden w-20 px-2 py-1.5 text-right font-medium sm:table-cell">
                  Pivot
                </th>
                <th className="hidden w-20 px-2 py-1.5 text-right font-medium sm:table-cell">
                  Premium
                </th>
                <th className="hidden w-16 px-2 py-1.5 text-right font-medium md:table-cell">
                  Loss
                </th>
                <th className="hidden w-14 px-2 py-1.5 text-right font-medium md:table-cell">
                  VAT
                </th>
                <th className="w-14 px-2 py-1.5 text-right font-medium">
                  Items
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No pricing categories yet.
                  </td>
                </tr>
              )}
              {categories.map((category) => (
                <tr key={category.id} className="align-top">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDialog({ mode: "edit", id: category.id })
                      }
                      className="text-left font-medium underline-offset-2 hover:underline"
                    >
                      {category.name}
                    </button>
                    {/* The numbers don't fit on a phone; a summary does. */}
                    <p className="text-xs text-muted-foreground tabular-nums sm:hidden">
                      {formatPercent(category.baseMargin, 1)} to{" "}
                      {formatPivot(category.pivotPrice)}, then{" "}
                      {formatPercent(category.premiumMargin, 1)} ·{" "}
                      {formatPercent(category.wastage)} loss · VAT{" "}
                      {formatPercent(category.vatRate)}
                    </p>
                    {category.notes && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {category.notes}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {formatPercent(category.baseMargin, 1)}
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {formatPivot(category.pivotPrice)}
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {formatPercent(category.premiumMargin, 1)}
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">
                    {formatPercent(category.wastage)}
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">
                    {formatPercent(category.vatRate)}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                    {category.itemCount}
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${category.name}`}
                      onClick={() =>
                        setDialog({ mode: "edit", id: category.id })
                      }
                    >
                      <PencilIcon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="space-y-4 lg:sticky lg:top-4">
          <SettingsForm
            settings={settings}
            referenceCandidates={referenceCandidates}
          />
          <section className="space-y-2 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">
              How advice works
            </h2>
            <p>
              A portion&apos;s cost is marked up with the <b>base margin</b>{" "}
              until the price reaches the <b>pivot price</b>. The part of the
              cost above that only gets the <b>premium margin</b>, so expensive
              drinks stay affordable while still earning more per glass.
            </p>
            <p>
              <b>Loss</b> is the share of a unit that never gets sold, like tap
              loss. <b>VAT</b> is the default; items can override it.
            </p>
          </section>
        </div>
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {dialog && (dialog.mode === "create" || editing) && (
            <CategoryForm
              key={editing?.id ?? "new"}
              category={editing}
              rounding={settings.priceRounding}
              onDone={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryForm({
  category,
  rounding,
  onDone,
}: {
  category?: CategoryWithUsage;
  rounding: number;
  onDone: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [baseMargin, setBaseMargin] = useState(
    category ? percent(category.baseMargin) : "66.6",
  );
  const [pivotPrice, setPivotPrice] = useState(
    category ? String(category.pivotPrice) : "",
  );
  const [premiumMargin, setPremiumMargin] = useState(
    category ? percent(category.premiumMargin) : "40",
  );
  const [wastage, setWastage] = useState(
    category ? percent(category.wastage) : "0",
  );
  const [vatRate, setVatRate] = useState(
    category ? percent(category.vatRate) : "21",
  );
  const [notes, setNotes] = useState(category?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const values = {
    baseMargin: parse(baseMargin),
    pivotPrice: parse(pivotPrice),
    premiumMargin: parse(premiumMargin),
    wastage: parse(wastage),
    vatRate: parse(vatRate),
  };
  const complete = Object.values(values).every((value) => value != null);
  const preview =
    complete && values.baseMargin! < 100 && values.premiumMargin! < 100
      ? {
          baseMargin: values.baseMargin! / 100,
          pivotPrice: values.pivotPrice!,
          premiumMargin: values.premiumMargin! / 100,
          wastage: values.wastage! / 100,
          vatRate: values.vatRate! / 100,
        }
      : null;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview) {
      toast.error("Fill in every number; margins stay below 100%.");
      return;
    }
    startTransition(async () => {
      const result = await savePricingCategory({
        id: category?.id,
        name,
        ...preview,
        notes: notes.trim() || null,
      });
      if (result.ok) {
        toast.success(category ? "Category saved" : "Category added");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDelete() {
    if (!category) return;
    if (!confirm(`Delete the pricing category “${category.name}”?`)) return;
    startTransition(async () => {
      const result = await deletePricingCategory(category.id);
      if (result.ok) {
        toast.success("Category deleted");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    suffix: string,
    hint: string,
  ) => (
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
          className="pr-6 tabular-nums"
          required
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {category ? category.name : "New pricing category"}
        </DialogTitle>
        <DialogDescription>
          {category
            ? `Used by ${category.itemCount} item${category.itemCount === 1 ? "" : "s"}. Changes apply to their advice right away.`
            : "Pick it for items on the prices page afterwards."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="category-name" className="text-xs">
            Name
          </Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fris"
            autoFocus={!category}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {field(
            "category-base",
            "Base margin",
            baseMargin,
            setBaseMargin,
            "%",
            "Up to the pivot",
          )}
          {field(
            "category-pivot",
            "Pivot price",
            pivotPrice,
            setPivotPrice,
            "€",
            "Incl. VAT",
          )}
          {field(
            "category-premium",
            "Premium margin",
            premiumMargin,
            setPremiumMargin,
            "%",
            "Above the pivot",
          )}
          {field(
            "category-loss",
            "Loss",
            wastage,
            setWastage,
            "%",
            "Never sold",
          )}
          {field("category-vat", "VAT", vatRate, setVatRate, "%", "Default")}
        </div>

        <div className="space-y-1">
          <Label htmlFor="category-notes" className="text-xs">
            Why
          </Label>
          <textarea
            id="category-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Pivot is where the old price should have been"
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        </div>

        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Advice for a portion costing
          </p>
          <div className="grid grid-cols-4 gap-2 text-sm tabular-nums">
            {SAMPLE_COSTS.map((cost) => (
              <div key={cost}>
                <p className="text-xs text-muted-foreground">
                  {formatPrice(cost)}
                </p>
                <p className="font-medium">
                  {preview
                    ? formatPrice(
                        roundPrice(advicePrice(cost, preview), rounding),
                      )
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {category && (
              <Button
                type="button"
                variant="ghost"
                onClick={onDelete}
                disabled={pending || category.itemCount > 0}
                title={
                  category.itemCount > 0
                    ? "Move its items to another category first"
                    : "Delete category"
                }
              >
                <Trash2Icon />
                Delete
              </Button>
            )}
          </div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {category ? "Save" : "Add category"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function SettingsForm({
  settings,
  referenceCandidates,
}: {
  settings: PricingSettings;
  referenceCandidates: { id: number; name: string }[];
}) {
  const [rounding, setRounding] = useState(String(settings.priceRounding));
  const [tolerance, setTolerance] = useState(percent(settings.adviceTolerance));
  const [reference, setReference] = useState(
    settings.alcoholReferenceItemId
      ? String(settings.alcoholReferenceItemId)
      : NONE,
  );
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priceRounding = parse(rounding);
    const adviceTolerance = parse(tolerance);
    if (priceRounding == null || adviceTolerance == null) {
      toast.error("Fill in every number.");
      return;
    }
    startTransition(async () => {
      const result = await savePricingSettings({
        priceRounding,
        adviceTolerance: adviceTolerance / 100,
        alcoholReferenceItemId: reference === NONE ? null : Number(reference),
      });
      if (result.ok) toast.success("Settings saved");
      else toast.error(result.error);
    });
  }

  const referenceItems = [
    { value: NONE, label: "None" },
    ...referenceCandidates.map((item) => ({
      value: String(item.id),
      label: item.name,
    })),
  ];

  return (
    <form
      onSubmit={onSubmit}
      className="overflow-hidden rounded-lg border bg-background"
    >
      <header className="border-b bg-muted/50 px-3 py-2">
        <h2 className="text-sm font-semibold">Settings</h2>
      </header>
      <div className="space-y-4 p-3">
        <div className="space-y-1">
          <Label htmlFor="settings-rounding" className="text-xs">
            Round advice to
          </Label>
          <div className="relative">
            <Input
              id="settings-rounding"
              value={rounding}
              onChange={(e) => setRounding(e.target.value)}
              inputMode="decimal"
              className="pr-6 tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="settings-tolerance" className="text-xs">
            Flag prices below the advice by more than
          </Label>
          <div className="relative">
            <Input
              id="settings-tolerance"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              inputMode="decimal"
              className="pr-6 tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
              %
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Alcohol reference</Label>
          <Select
            items={referenceItems}
            value={reference}
            onValueChange={(value) => setReference(String(value))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {referenceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Drinks whose alcohol is cheaper than in this one get flagged.
          </p>
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2Icon className="animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
