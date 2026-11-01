"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { OpenItemLink } from "@/components/item-links";
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
import type { PickerProduct } from "@/lib/assortment/queries";
import { suggestQueries } from "@/lib/images/search";
import {
  formatInputNumber,
  formatInputPrice,
  formatNumber,
  formatPercent,
  formatPrice,
} from "@/lib/format";
import type { ItemDialogData } from "@/lib/items/queries";
import {
  advicePrice,
  portionCost,
  portionsPerUnit,
  roundPrice,
} from "@/lib/pricing/calc";
import { parseTypedNumber } from "@/lib/numbers";
import { parseContents } from "@/lib/pricing/contents";
import { ImagePicker } from "@/app/order-list/image-picker";
import { ProductPicker } from "@/app/order-list/product-picker";
import { SalePriceHistoryList } from "@/app/pricing/sale-price-history";
import {
  deleteItem,
  loadItemDialog,
  saveItem,
  setItemArchived,
} from "./actions";

const NEW_CATEGORY = "new";
const NONE = "none";
const DEFAULT_VAT = "default";
const VAT_RATES = [0, 0.09, 0.21];

// Only the id is kept; the dialog loads the item itself when it opens, so it
// never needs a screen to have all of it at hand.
export type ItemDialogState =
  | {
      mode: "create";
      categoryId?: number;
      // What we buy somewhere other than Rust Food, so without a product link.
      otherSupplier?: boolean;
    }
  | { mode: "edit"; itemId: number; section?: "item" | "pricing" };

const isNumber = (text: string) =>
  text.trim() === "" || parseTypedNumber(text) !== null;

// What a field saves as. One left alone keeps exactly what is stored: the form
// shows it rounded, and changing an item's name shouldn't change its cost.
function fieldValue(
  text: string,
  stored: number | null | undefined,
  factor = 1,
) {
  if (stored != null && text === formatInputNumber(stored, factor)) {
    return stored;
  }
  const value = parseTypedNumber(text);
  return value != null ? value / factor : null;
}

export function ItemDialog({
  state,
  onClose,
}: {
  state: ItemDialogState | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      {/* Only the fields scroll, so Save stays in reach. */}
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        {state && (
          // Remounting per item gives the form fresh initial values.
          <ItemDialogBody
            key={state.mode === "edit" ? `item-${state.itemId}` : "new"}
            state={state}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemDialogBody({
  state,
  onClose,
}: {
  state: ItemDialogState;
  onClose: () => void;
}) {
  const [data, setData] = useState<ItemDialogData | null>(null);
  const itemId = state.mode === "edit" ? state.itemId : undefined;

  useEffect(() => {
    let cancelled = false;
    const fail = (error: string) => {
      if (cancelled) return;
      toast.error(error);
      onClose();
    };
    loadItemDialog(itemId).then(
      (result) => {
        if (!result.ok) fail(result.error);
        else if (!cancelled) setData(result.data);
      },
      () => fail("Could not load the item."),
    );
    return () => {
      cancelled = true;
    };
    // Screens pass a new onClose on every render; only the item matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        <DialogTitle>Loading…</DialogTitle>
      </div>
    );
  }
  return <ItemForm state={state} data={data} onClose={onClose} />;
}

function ItemForm({
  state,
  data,
  onClose,
}: {
  state: ItemDialogState;
  data: ItemDialogData;
  onClose: () => void;
}) {
  const { item, orderCategories, pricingCategories, priceRounding } = data;
  const otherSupplier = state.mode === "create" && !!state.otherSupplier;
  const startsAtPricing = state.mode === "edit" && state.section === "pricing";

  // Item.
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    String(
      item?.categoryId ??
        (state.mode === "create" ? state.categoryId : undefined) ??
        orderCategories[0]?.id ??
        "",
    ),
  );
  const [newCategory, setNewCategory] = useState("");
  const [target, setTarget] = useState(formatInputNumber(item?.target));
  const [note, setNote] = useState(item?.note ?? "");
  const [product, setProduct] = useState<PickerProduct | null>(
    item?.supplierProductId && item.itemNo
      ? {
          id: item.supplierProductId,
          itemNo: item.itemNo,
          description: item.supplierDescription ?? item.name,
          unitOfMeasure: item.unitOfMeasure,
          unitPrice: item.unitPrice,
          imageStatus: item.imageStatus,
        }
      : null,
  );
  // Unlinking only happens when you press Unlink. Saving can never drop an
  // existing link by itself, whatever the form state looks like.
  const [unlinked, setUnlinked] = useState(false);

  // Pricing.
  const [pricingCategoryId, setPricingCategoryId] = useState(
    item?.pricingCategoryId ? String(item.pricingCategoryId) : NONE,
  );
  const [notForSale, setNotForSale] = useState(item?.notForSale ?? false);
  const [manualPrice, setManualPrice] = useState(
    formatInputNumber(item?.manualPurchasePrice),
  );
  const [source, setSource] = useState(item?.purchaseSource ?? "");
  const [unitVolume, setUnitVolume] = useState(
    formatInputNumber(item?.unitVolume),
  );
  // Portions are entered in cl, percentages as percentages.
  const [portionVolume, setPortionVolume] = useState(
    formatInputNumber(item?.portionVolume, 100),
  );
  const [portions, setPortions] = useState(
    formatInputNumber(item?.portionsPerUnit),
  );
  const [alcohol, setAlcohol] = useState(
    formatInputNumber(item?.alcoholPercentage, 100),
  );
  const [vat, setVat] = useState(
    item?.vatRate != null ? String(item.vatRate) : DEFAULT_VAT,
  );

  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const itemSection = useRef<HTMLElement>(null);
  const pricingSection = useRef<HTMLElement>(null);

  useEffect(() => {
    if (startsAtPricing) pricingSection.current?.scrollIntoView();
    // Only where it opens; after that the scrolling is yours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Our own image is only offered when the supplier doesn't provide one.
  const supplierHasImage =
    !!item?.supplierProductId && item.imageStatus === "available";

  // These follow the link in the form, which may not be saved yet.
  const catalogPrice = product?.unitPrice ?? null;
  const suggestion = parseContents(product?.description ?? null);
  const hasSuggestion =
    suggestion.unitVolume != null ||
    suggestion.count != null ||
    suggestion.alcoholPercentage != null;

  const pricingCategory = pricingCategories.find(
    (candidate) => String(candidate.id) === pricingCategoryId,
  );
  const portionVolumeCl = parseTypedNumber(portionVolume);
  const alcoholPercent = parseTypedNumber(alcohol);
  const input = {
    purchasePrice: parseTypedNumber(manualPrice) ?? catalogPrice,
    unitVolume: parseTypedNumber(unitVolume),
    portionVolume: portionVolumeCl != null ? portionVolumeCl / 100 : null,
    portionsPerUnit: parseTypedNumber(portions),
    vatRate: vat === DEFAULT_VAT ? null : Number(vat),
    alcoholPercentage: alcoholPercent != null ? alcoholPercent / 100 : null,
  };
  const computedPortions = portionsPerUnit({ ...input, portionsPerUnit: null });
  const cost = pricingCategory ? portionCost(input, pricingCategory) : null;
  const advice =
    pricingCategory && cost != null ? advicePrice(cost, pricingCategory) : null;

  function applySuggestion() {
    if (suggestion.unitVolume != null) {
      setUnitVolume(formatInputNumber(suggestion.unitVolume));
    }
    // A crate of small bottles is sold per bottle; a keg, a bottle of
    // spirits or a crate of liter bottles needs a portion size from you.
    if (
      suggestion.packVolume != null &&
      suggestion.packVolume <= 0.5 &&
      suggestion.count != null
    ) {
      setPortionVolume(formatInputNumber(suggestion.packVolume, 100));
      setPortions("");
    } else if (suggestion.unitVolume == null && suggestion.count != null) {
      setPortions(formatInputNumber(suggestion.count));
    }
    if (suggestion.alcoholPercentage != null) {
      setAlcohol(formatInputNumber(suggestion.alcoholPercentage, 100));
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const notANumber = (
      [
        ["Target", target],
        ["Purchase price", manualPrice],
        ["Unit", unitVolume],
        ["Portion", portionVolume],
        ["Portions", portions],
        ["Alcohol", alcohol],
      ] as const
    ).find(([, text]) => !isNumber(text));
    if (notANumber) {
      toast.error(`${notANumber[0]} is not a number.`);
      return;
    }

    const supplierProductId = product
      ? product.id
      : unlinked
        ? null
        : (item?.supplierProductId ?? null);

    startTransition(async () => {
      const result = await saveItem({
        id: item?.id,
        name,
        categoryId:
          categoryId === NEW_CATEGORY
            ? undefined
            : Number(categoryId) || undefined,
        newCategoryName:
          categoryId === NEW_CATEGORY ? newCategory.trim() : undefined,
        target: fieldValue(target, item?.target),
        supplierProductId,
        note: note.trim() || null,
        pricingCategoryId: pricingCategory ? pricingCategory.id : null,
        notForSale,
        unitVolume: fieldValue(unitVolume, item?.unitVolume),
        portionVolume: fieldValue(portionVolume, item?.portionVolume, 100),
        portionsPerUnit: fieldValue(portions, item?.portionsPerUnit),
        alcoholPercentage: fieldValue(alcohol, item?.alcoholPercentage, 100),
        vatRate: input.vatRate,
        manualPurchasePrice: fieldValue(manualPrice, item?.manualPurchasePrice),
        purchaseSource: source.trim() || null,
      });
      if (result.ok) {
        toast.success(item ? "Item saved" : "Item added");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onArchive() {
    if (!item) return;
    const archived = item.archivedAt !== null;
    startTransition(async () => {
      const result = await setItemArchived(item.id, !archived);
      if (result.ok) {
        toast.success(archived ? "Item restored" : "Item archived");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDelete() {
    if (!item) return;
    if (!confirm(`Delete “${item.name}” permanently?`)) return;
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (result.ok) {
        toast.success("Item deleted");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle className="pr-6 leading-snug break-words">
          {item
            ? item.name
            : otherSupplier
              ? "Item from another supplier"
              : "New item"}
        </DialogTitle>
        <DialogDescription className="break-words">
          {item
            ? (item.supplierDescription ??
              item.purchaseSource ??
              "Not linked to a Rust Food product.")
            : otherSupplier
              ? "For what we buy somewhere other than Rust Food. It also shows on the order list, to order by hand."
              : "The name is what you see while ordering. Link a catalog product to order it and to show its price."}
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              itemSection.current?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Item
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              pricingSection.current?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Pricing
          </Button>
          {item && (
            <OpenItemLink
              itemId={item.id}
              label="Open item"
              className="ml-auto w-fit"
            />
          )}
        </div>
      </DialogHeader>

      {/* min-w-0: as a flex item the form would otherwise widen the dialog to
          fit a long supplier description, even though that text truncates. */}
      <form
        onSubmit={onSubmit}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
      >
        <div className="-mx-4 min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-4">
          <section ref={itemSection} className="space-y-4">
            <SectionHeading>Item</SectionHeading>

            <div className="space-y-2">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={otherSupplier ? "Wisselwhisky" : "Coca-Cola Zero"}
                autoFocus={!startsAtPricing}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Order category</Label>
                <SelectField
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    ...orderCategories.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    })),
                    { value: NEW_CATEGORY, label: "New category…" },
                  ]}
                />
                {categoryId === NEW_CATEGORY && (
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Category name"
                    required
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-target">Target (optional)</Label>
                <Input
                  id="item-target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  inputMode="decimal"
                  placeholder="4"
                />
                <p className="text-xs text-muted-foreground">
                  Desired stock, in the supplier&apos;s unit.
                </p>
              </div>
            </div>

            {!otherSupplier && (
              <div className="space-y-2">
                <Label>Supplier product</Label>
                <ProductPicker
                  value={product}
                  onChange={(next) => {
                    setProduct(next);
                    setUnlinked(next === null);
                  }}
                  suggestion={name.trim() || undefined}
                />
              </div>
            )}

            {item && (
              <div className="space-y-2">
                <Label>Image</Label>
                <ImagePicker
                  itemId={item.id}
                  hasOwnImage={item.hasOwnImage}
                  supplierItemNo={supplierHasImage ? item.itemNo : null}
                  suggestions={suggestQueries({
                    name: name.trim() || item.name,
                    supplierDescription:
                      product?.description ?? item.supplierDescription,
                  })}
                  searchOnOpen={!startsAtPricing}
                  onChanged={() => router.refresh()}
                />
                <p className="text-xs text-muted-foreground">
                  {supplierHasImage
                    ? "An image of our own replaces the supplier's photo on the order and pricing pages; the catalog keeps the supplier's."
                    : "The supplier has no photo for this item, so pick one here."}{" "}
                  It is stored with the item.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="item-note">Note (optional)</Label>
              <Input
                id="item-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. rotating whisky"
              />
            </div>
          </section>

          <section ref={pricingSection} className="space-y-4">
            <SectionHeading>Pricing</SectionHeading>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Pricing category</Label>
                <SelectField
                  value={pricingCategoryId}
                  onChange={setPricingCategoryId}
                  options={[
                    { value: NONE, label: "None" },
                    ...pricingCategories.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label>VAT</Label>
                <SelectField
                  value={vat}
                  onChange={setVat}
                  options={[
                    {
                      value: DEFAULT_VAT,
                      label: `Category (${formatPercent(pricingCategory?.vatRate)})`,
                    },
                    ...VAT_RATES.map((rate) => ({
                      value: String(rate),
                      label: formatPercent(rate),
                    })),
                  ]}
                />
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
                <Label htmlFor="item-purchase">Purchase price</Label>
                <Input
                  id="item-purchase"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder={
                    catalogPrice != null
                      ? formatInputPrice(catalogPrice)
                      : "per unit, excl. VAT"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {catalogPrice != null
                    ? `Empty uses Rust's ${formatPrice(catalogPrice)} per ${product?.unitOfMeasure?.toLowerCase() ?? "unit"}.`
                    : "Per purchase unit, excluding VAT."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-source">Bought at (optional)</Label>
                <Input
                  id="item-source"
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
                  <Label htmlFor="item-unit" className="text-xs">
                    Unit (L)
                  </Label>
                  <Input
                    id="item-unit"
                    value={unitVolume}
                    onChange={(e) => setUnitVolume(e.target.value)}
                    inputMode="decimal"
                    placeholder="4,8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="item-portion" className="text-xs">
                    Portion (cl)
                  </Label>
                  <Input
                    id="item-portion"
                    value={portionVolume}
                    onChange={(e) => setPortionVolume(e.target.value)}
                    inputMode="decimal"
                    placeholder="20"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="item-portions" className="text-xs">
                    Portions
                  </Label>
                  <Input
                    id="item-portions"
                    value={portions}
                    onChange={(e) => setPortions(e.target.value)}
                    inputMode="decimal"
                    placeholder={
                      computedPortions != null
                        ? formatNumber(computedPortions, 2)
                        : "24"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="item-alcohol" className="text-xs">
                    Alcohol (%)
                  </Label>
                  <Input
                    id="item-alcohol"
                    value={alcohol}
                    onChange={(e) => setAlcohol(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Portions follow from unit and portion size; fill them in
                yourself for what isn&apos;t poured, like crisps.
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

            {item && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Sale price history</p>
                {data.salePriceHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No changes yet.
                  </p>
                ) : (
                  <SalePriceHistoryList
                    history={data.salePriceHistory}
                    className="max-h-40 overflow-y-auto"
                  />
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between sm:justify-between">
          <div className="flex gap-2">
            {item && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onArchive}
                  disabled={pending}
                >
                  {item.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  {item.archivedAt ? "Restore" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onDelete}
                  disabled={pending}
                  aria-label="Delete item"
                >
                  <Trash2Icon />
                </Button>
              </>
            )}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              !item && <PlusIcon />
            )}
            {item ? "Save" : "Add item"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b pb-1.5 text-sm font-semibold">{children}</h3>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onChange(String(next))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
