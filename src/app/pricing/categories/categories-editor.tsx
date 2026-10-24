"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
import type { PricingCategory, PricingSettings } from "@/db/schema";
import { formatPrice } from "@/lib/format";
import {
  deletePricingCategory,
  savePricingCategory,
  savePricingSettings,
} from "../actions";

type CategoryWithUsage = PricingCategory & { itemCount: number };

const NONE = "none";

const parse = (text: string) => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};
// Margins and rates are stored as fractions but typed as percentages.
const percent = (value: number) => String(Number((value * 100).toFixed(2)));

export function CategoriesEditor({
  categories,
  settings,
  referenceCandidates,
}: {
  categories: CategoryWithUsage[];
  settings: PricingSettings;
  referenceCandidates: { id: number; name: string }[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Categories &amp; settings
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The cost of a portion is marked up with the base margin until the
          price reaches the pivot price. The part of the cost above that only
          gets the premium margin, so expensive drinks stay affordable while
          still earning more per glass. Loss is the share of a unit that never
          gets sold, like tap loss.
        </p>
      </div>

      <div className="space-y-3">
        {categories.map((category) => (
          <CategoryForm key={category.id} category={category} />
        ))}
        {adding ? (
          <CategoryForm onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon />
            New pricing category
          </Button>
        )}
      </div>

      <SettingsForm
        settings={settings}
        referenceCandidates={referenceCandidates}
      />
    </div>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category?: CategoryWithUsage;
  onDone?: () => void;
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
  const dirty =
    !category ||
    name.trim() !== category.name ||
    (notes.trim() || null) !== category.notes ||
    values.pivotPrice !== category.pivotPrice ||
    (["baseMargin", "premiumMargin", "wastage", "vatRate"] as const).some(
      (key) => values[key] !== Number(percent(category[key])),
    );

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (Object.values(values).some((value) => value == null)) {
      toast.error("Fill in every number.");
      return;
    }
    startTransition(async () => {
      const result = await savePricingCategory({
        id: category?.id,
        name,
        baseMargin: values.baseMargin! / 100,
        pivotPrice: values.pivotPrice!,
        premiumMargin: values.premiumMargin! / 100,
        wastage: values.wastage! / 100,
        vatRate: values.vatRate! / 100,
        notes: notes.trim() || null,
      });
      if (result.ok) {
        toast.success(category ? "Category saved" : "Category added");
        onDone?.();
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
      if (result.ok) toast.success("Category deleted");
      else toast.error(result.error);
    });
  }

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    suffix: string,
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
    </div>
  );

  const prefix = `category-${category?.id ?? "new"}`;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border bg-background p-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor={`${prefix}-name`} className="text-xs">
            Name
          </Label>
          <Input
            id={`${prefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fris"
            autoFocus={!category}
            required
          />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {category
            ? `${category.itemCount} item${category.itemCount === 1 ? "" : "s"}`
            : "New"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {field(`${prefix}-base`, "Base margin", baseMargin, setBaseMargin, "%")}
        {field(
          `${prefix}-pivot`,
          "Pivot price",
          pivotPrice,
          setPivotPrice,
          "€",
        )}
        {field(
          `${prefix}-premium`,
          "Premium margin",
          premiumMargin,
          setPremiumMargin,
          "%",
        )}
        {field(`${prefix}-loss`, "Loss", wastage, setWastage, "%")}
        {field(`${prefix}-vat`, "VAT", vatRate, setVatRate, "%")}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-notes`} className="text-xs">
          Why
        </Label>
        <Input
          id={`${prefix}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Pivot is where the old price should have been"
        />
      </div>
      <div className="flex justify-end gap-2">
        {category ? (
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
            aria-label="Delete category"
          >
            <Trash2Icon />
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2Icon className="animate-spin" />}
          {category ? "Save" : "Add category"}
        </Button>
      </div>
    </form>
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
      className="space-y-3 rounded-lg border bg-background p-3"
    >
      <h2 className="text-sm font-semibold">Settings</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="settings-rounding" className="text-xs">
            Round advice to
          </Label>
          <Input
            id="settings-rounding"
            value={rounding}
            onChange={(e) => setRounding(e.target.value)}
            inputMode="decimal"
          />
          <p className="text-xs text-muted-foreground">
            e.g. 0.1 rounds to {formatPrice(0.1)}.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="settings-tolerance" className="text-xs">
            Flag prices off the advice by more than (%)
          </Label>
          <Input
            id="settings-tolerance"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
            inputMode="decimal"
          />
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
            Drinks with cheaper alcohol than this get flagged.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
