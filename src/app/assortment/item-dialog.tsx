"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
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
import type { AssortmentCategory } from "@/db/schema";
import type { AssortmentRow, PickerProduct } from "@/lib/assortment/queries";
import {
  deleteAssortmentItem,
  saveAssortmentItem,
  setItemArchived,
} from "./actions";
import { suggestQueries } from "@/lib/images/search";
import { ImagePicker } from "./image-picker";
import { ProductPicker } from "./product-picker";

const NEW_CATEGORY = "new";

// Only the id is kept; the item itself is looked up in the current data, so
// the form never saves a stale copy from when it was opened.
export type ItemDialogState =
  | { mode: "create"; categoryId?: number }
  | { mode: "edit"; itemId: number };

export function ItemDialog({
  state,
  item,
  categories,
  onClose,
}: {
  state: ItemDialogState | null;
  // The current row for state.itemId, or null when it no longer exists.
  item: AssortmentRow | null;
  categories: AssortmentCategory[];
  onClose: () => void;
}) {
  const open = state !== null && (state.mode === "create" || item !== null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {state && (state.mode === "create" || item) && (
          // Remounting per item gives the form fresh initial values.
          <ItemForm
            key={state.mode === "edit" ? `item-${state.itemId}` : "new"}
            item={state.mode === "edit" ? item : null}
            createCategoryId={
              state.mode === "create" ? state.categoryId : undefined
            }
            categories={categories}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  item,
  createCategoryId,
  categories,
  onClose,
}: {
  item: AssortmentRow | null;
  createCategoryId?: number;
  categories: AssortmentCategory[];
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    String(item?.categoryId ?? createCategoryId ?? categories[0]?.id ?? ""),
  );
  const [newCategory, setNewCategory] = useState("");
  const [target, setTarget] = useState(
    item?.target != null ? String(item.target) : "",
  );
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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Our own image is only offered when the supplier doesn't provide one.
  const supplierHasImage =
    !!item?.supplierProductId && item.imageStatus === "available";

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const targetValue = target.trim().replace(",", ".");
    const supplierProductId = product
      ? product.id
      : unlinked
        ? null
        : (item?.supplierProductId ?? null);

    startTransition(async () => {
      const result = await saveAssortmentItem({
        id: item?.id,
        name,
        categoryId:
          categoryId === NEW_CATEGORY ? undefined : Number(categoryId),
        newCategoryName:
          categoryId === NEW_CATEGORY ? newCategory.trim() : undefined,
        target: targetValue === "" ? null : Number(targetValue),
        supplierProductId,
        note: note.trim() || null,
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
      const result = await deleteAssortmentItem(item.id);
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
      <DialogHeader>
        <DialogTitle>{item ? "Edit item" : "New item"}</DialogTitle>
        <DialogDescription>
          The name is what you see while ordering. Link a catalog product to
          order it and to show its price.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="item-name">Name</Label>
          <Input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Coca-Cola Zero"
            autoFocus
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              items={[
                ...categories.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                })),
                { value: NEW_CATEGORY, label: "New category…" },
              ]}
              value={categoryId}
              onValueChange={(value) => setCategoryId(String(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CATEGORY}>New category…</SelectItem>
              </SelectContent>
            </Select>
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

        {item && !supplierHasImage && (
          <div className="space-y-2">
            <Label>Image</Label>
            <ImagePicker
              itemId={item.id}
              hasOwnImage={item.hasOwnImage}
              suggestions={suggestQueries({
                name: name.trim() || item.name,
                supplierDescription: product?.description ?? item.supplierDescription,
              })}
              onChanged={() => router.refresh()}
            />
            <p className="text-xs text-muted-foreground">
              The supplier has no photo for this item, so pick one here. It is
              stored with the item.
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

        <DialogFooter className="gap-2 sm:justify-between">
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
            {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {item ? "Save" : "Add item"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
