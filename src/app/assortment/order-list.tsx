"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  GripVerticalIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  StickyNoteIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DiscountBadge } from "@/components/discount-badge";
import { ItemImage } from "@/components/item-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssortmentCategory } from "@/db/schema";
import type {
  AssortmentCategoryWithItems,
  AssortmentRow,
} from "@/lib/assortment/queries";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  clearOrderList,
  createNote,
  deleteAssortmentItem,
  reorderCategories,
  reorderItems,
  setQuantityToBuy,
  updateNote,
} from "./actions";
import { ItemDialog, type ItemDialogState } from "./item-dialog";

const SAVE_DEBOUNCE_MS = 300;
type View = "all" | "order" | "archived";

export function OrderList({
  categories,
  archived,
  allCategories,
}: {
  categories: AssortmentCategoryWithItems[];
  archived: AssortmentCategoryWithItems[];
  allCategories: AssortmentCategory[];
}) {
  const [view, setView] = useState<View>("all");
  const [reordering, setReordering] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<ItemDialogState | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  // Local order, applied on top of the server's until it catches up.
  const [categoryOrder, setCategoryOrder] = useState<number[] | null>(null);
  const [itemOrder, setItemOrder] = useState<Record<number, number[]>>({});
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // A short hold before dragging keeps the list scrollable on a phone.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const serverQuantities = useMemo(() => {
    const map: Record<number, number> = {};
    for (const category of categories) {
      for (const item of category.items) map[item.id] = item.quantityToBuy;
    }
    return map;
  }, [categories]);

  const quantityOf = (item: AssortmentRow) =>
    quantities[item.id] ?? serverQuantities[item.id] ?? 0;
  const noteTextOf = (item: AssortmentRow) => notes[item.id] ?? item.name;

  // Mirrors the edits above in a ref, so two quick taps on + both count
  // instead of reading the same value from their own render.
  const edits = useRef<Record<number, number>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  function saveLater(id: number, save: () => Promise<void>) {
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        startTransition(save);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  function adjustQuantity(item: AssortmentRow, delta: number) {
    const current = edits.current[item.id] ?? serverQuantities[item.id] ?? 0;
    changeQuantity(item, current + delta);
  }

  function changeQuantity(item: AssortmentRow, quantity: number) {
    const next = Math.max(0, Math.round(quantity * 100) / 100);
    edits.current[item.id] = next;
    setQuantities((current) => ({ ...current, [item.id]: next }));

    saveLater(item.id, async () => {
      const result = await setQuantityToBuy(item.id, next);
      if (!result.ok) {
        toast.error(`${item.name}: ${result.error}`);
        delete edits.current[item.id];
        setQuantities((current) => {
          const rest = { ...current };
          delete rest[item.id];
          return rest;
        });
      }
    });
  }

  function changeNote(item: AssortmentRow, text: string) {
    setNotes((current) => ({ ...current, [item.id]: text }));
    saveLater(item.id, async () => {
      const result = await updateNote(item.id, text);
      if (!result.ok) toast.error(result.error);
    });
  }

  function addNote(categoryId: number) {
    startTransition(async () => {
      const result = await createNote(categoryId);
      if (!result.ok) toast.error(result.error);
    });
  }

  function removeRow(item: AssortmentRow) {
    startTransition(async () => {
      const result = await deleteAssortmentItem(item.id);
      if (!result.ok) toast.error(result.error);
    });
  }

  // Apply the local order on top of what the server sent.
  const source = view === "archived" ? archived : categories;
  const ordered = useMemo(() => {
    const rank = (ids: number[] | undefined, id: number) => {
      const index = ids?.indexOf(id) ?? -1;
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const list = categoryOrder
      ? [...source].sort(
          (a, b) => rank(categoryOrder, a.id) - rank(categoryOrder, b.id),
        )
      : source;
    return list.map((category) => {
      const ids = itemOrder[category.id];
      return ids
        ? {
            ...category,
            items: [...category.items].sort(
              (a, b) => rank(ids, a.id) - rank(ids, b.id),
            ),
          }
        : category;
    });
  }, [source, categoryOrder, itemOrder]);

  const term = search.trim().toLowerCase();
  const visible = ordered
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        if (reordering) return true;
        if (view === "order") {
          return item.kind === "product" && quantityOf(item) > 0;
        }
        if (!term) return true;
        return (
          noteTextOf(item).toLowerCase().includes(term) ||
          item.supplierDescription?.toLowerCase().includes(term) ||
          item.itemNo?.includes(term)
        );
      }),
    }))
    .filter((category) => reordering || category.items.length > 0);

  const products = categories.flatMap((category) =>
    category.items.filter((item) => item.kind === "product"),
  );
  // Always hand the dialog the current row, never the one from when it opened.
  const dialogItem =
    dialog?.mode === "edit"
      ? ([...categories, ...archived]
          .flatMap((category) => category.items)
          .find((item) => item.id === dialog.itemId) ?? null)
      : null;
  const orderLines = products.filter((item) => quantityOf(item) > 0);
  const orderTotal = orderLines.reduce(
    (sum, item) => sum + quantityOf(item) * (item.unitPrice ?? 0),
    0,
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const idOf = (value: string) => Number(value.slice(4));
    // While dragging a category you usually hover a row inside another one.
    const categoryIdOf = (value: string) =>
      value.startsWith("cat-")
        ? idOf(value)
        : (ordered.find((category) =>
            category.items.some((item) => item.id === idOf(value)),
          )?.id ?? null);

    if (activeId.startsWith("cat-")) {
      const ids = ordered.map((category) => category.id);
      const overCategoryId = categoryIdOf(overId);
      const from = ids.indexOf(idOf(activeId));
      const to = overCategoryId === null ? -1 : ids.indexOf(overCategoryId);
      if (from === -1 || to === -1 || from === to) return;
      const next = arrayMove(ids, from, to);
      setCategoryOrder(next);
      startTransition(async () => {
        const result = await reorderCategories(next);
        if (!result.ok) toast.error(result.error);
      });
      return;
    }

    // Rows only move within their own category; use the form to move an item
    // to another category.
    const rowId = idOf(activeId);
    const category = ordered.find((c) =>
      c.items.some((item) => item.id === rowId),
    );
    if (!category || overId.startsWith("cat-")) return;
    const ids = category.items.map((item) => item.id);
    const from = ids.indexOf(rowId);
    const to = ids.indexOf(idOf(overId));
    if (from === -1 || to === -1) return;
    const next = arrayMove(ids, from, to);
    setItemOrder((current) => ({ ...current, [category.id]: next }));
    startTransition(async () => {
      const result = await reorderItems(next);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="pb-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assortment</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} items ·{" "}
            {reordering ? "drag to rearrange" : "tap + for what needs ordering"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={reordering ? "default" : "outline"}
            onClick={() => setReordering((value) => !value)}
          >
            {reordering ? <CheckIcon /> : <GripVerticalIcon />}
            {reordering ? "Done" : "Rearrange"}
          </Button>
          {!reordering && (
            <Button onClick={() => setDialog({ mode: "create" })}>
              <PlusIcon />
              New item
            </Button>
          )}
        </div>
      </div>

      {!reordering && (
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
          <div className="flex gap-1">
            <ViewTab current={view} value="all" onSelect={setView}>
              All
            </ViewTab>
            <ViewTab current={view} value="order" onSelect={setView}>
              To order{orderLines.length > 0 && ` (${orderLines.length})`}
            </ViewTab>
            <ViewTab current={view} value="archived" onSelect={setView}>
              Archived
            </ViewTab>
          </div>
        </div>
      )}

      {visible.length === 0 && (
        <p className="rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          {view === "order"
            ? "Nothing to order yet."
            : view === "archived"
              ? "No archived items."
              : "No items found."}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={visible.map((category) => `cat-${category.id}`)}
          strategy={verticalListSortingStrategy}
          disabled={!reordering}
        >
          <div className="space-y-4">
            {visible.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                reordering={reordering}
                onAddItem={() =>
                  setDialog({ mode: "create", categoryId: category.id })
                }
                onAddNote={() => addNote(category.id)}
              >
                <SortableContext
                  items={category.items.map((item) => `row-${item.id}`)}
                  strategy={verticalListSortingStrategy}
                  disabled={!reordering}
                >
                  <ul className="divide-y">
                    {category.items.map((item) =>
                      item.kind === "note" ? (
                        <NoteRow
                          key={item.id}
                          item={item}
                          text={noteTextOf(item)}
                          reordering={reordering}
                          onChange={(text) => changeNote(item, text)}
                          onDelete={() => removeRow(item)}
                        />
                      ) : (
                        <ItemRow
                          key={item.id}
                          item={item}
                          quantity={quantityOf(item)}
                          reordering={reordering}
                          onChange={(value) => changeQuantity(item, value)}
                          onAdjust={(delta) => adjustQuantity(item, delta)}
                          onEdit={() =>
                            setDialog({ mode: "edit", itemId: item.id })
                          }
                        />
                      ),
                    )}
                    {category.items.length === 0 && (
                      <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                        Still empty.
                      </li>
                    )}
                  </ul>
                </SortableContext>
              </CategorySection>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {orderLines.length > 0 && !reordering && (
        <OrderSummaryBar
          lines={orderLines.length}
          total={orderTotal}
          onCleared={() => {
            edits.current = {};
            setQuantities({});
          }}
        />
      )}

      <ItemDialog
        state={dialog}
        item={dialogItem}
        categories={allCategories}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function CategorySection({
  category,
  reordering,
  onAddItem,
  onAddNote,
  children,
}: {
  category: AssortmentCategoryWithItems;
  reordering: boolean;
  onAddItem: () => void;
  onAddNote: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `cat-${category.id}`, disabled: !reordering });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "overflow-hidden rounded-lg border bg-background",
        isDragging && "relative z-10 opacity-90 shadow-lg",
      )}
    >
      <h2 className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
        {reordering && (
          <button
            type="button"
            className="-ml-1 cursor-grab touch-none p-1 text-muted-foreground"
            aria-label={`Move ${category.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        )}
        <span className="flex-1">{category.name}</span>
        {!reordering && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddNote}
              aria-label={`Add note to ${category.name}`}
            >
              <StickyNoteIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddItem}
              aria-label={`Add item to ${category.name}`}
            >
              <PlusIcon />
            </Button>
          </>
        )}
      </h2>
      {children}
    </section>
  );
}

function RowHandle({
  listeners,
  attributes,
  label,
}: {
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
  label: string;
}) {
  return (
    <button
      type="button"
      className="cursor-grab touch-none p-1 text-muted-foreground"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <GripVerticalIcon className="size-5" />
    </button>
  );
}

function ItemRow({
  item,
  quantity,
  reordering,
  onChange,
  onAdjust,
  onEdit,
}: {
  item: AssortmentRow;
  quantity: number;
  reordering: boolean;
  onChange: (quantity: number) => void;
  onAdjust: (delta: number) => void;
  onEdit: () => void;
}) {
  const active = quantity > 0;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `row-${item.id}`, disabled: !reordering });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3",
        active && !reordering && "bg-primary/5",
        isDragging && "relative z-10 bg-background shadow-md",
      )}
    >
      {reordering && (
        <RowHandle
          listeners={listeners}
          attributes={attributes}
          label={`Move ${item.name}`}
        />
      )}

      <ItemImage
        itemId={item.id}
        itemNo={item.itemNo}
        hasOwnImage={item.hasOwnImage}
        imageStatus={item.imageStatus}
        alt={item.supplierDescription ?? item.name}
      />

      <button
        type="button"
        onClick={onEdit}
        disabled={reordering}
        className="group min-w-0 flex-1 text-left"
      >
        <span className="flex items-start gap-1.5 font-medium">
          <span className="line-clamp-2">{item.name}</span>
          {!reordering && (
            <PencilIcon className="mt-1 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {item.unitOfMeasure && <span>{item.unitOfMeasure}</span>}
          {item.unitPrice != null && <span>{formatPrice(item.unitPrice)}</span>}
          {item.discount && item.discount.kind !== "unknown" && (
            <DiscountBadge
              status={item.discount}
              unitPrice={item.unitPrice}
              className="px-1 py-0 text-[10px]"
            />
          )}
          {!item.supplierProductId && (
            <Badge variant="outline" className="gap-1 text-amber-700">
              <AlertTriangleIcon className="size-3" />
              Not linked
            </Badge>
          )}
          {item.supplierRemoved && (
            <Badge variant="outline">Gone from catalog</Badge>
          )}
          {item.note && <span className="italic">{item.note}</span>}
        </span>
      </button>

      {!reordering && (
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {/* The target, for comparing against what's on the shelf. */}
          <span
            className="w-6 pr-0.5 text-right text-base font-semibold text-muted-foreground tabular-nums sm:w-8 sm:text-lg"
            aria-label={
              item.target == null ? undefined : `Target ${item.target}`
            }
          >
            {item.target ?? ""}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => onAdjust(-1)}
            disabled={quantity <= 0}
            aria-label={`One less ${item.name}`}
          >
            <MinusIcon />
          </Button>
          <input
            value={quantity === 0 ? "" : quantity}
            onChange={(e) => {
              const value = e.target.value.trim().replace(",", ".");
              if (value === "") return onChange(0);
              const parsed = Number(value);
              if (Number.isFinite(parsed)) onChange(parsed);
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label={`Amount ${item.name}`}
            className={cn(
              "h-9 w-9 rounded-md border bg-background text-center text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-11",
              active && "border-primary font-semibold",
            )}
          />
          <Button
            size="icon"
            className="size-9"
            onClick={() => onAdjust(1)}
            aria-label={`One more ${item.name}`}
          >
            <PlusIcon />
          </Button>
        </div>
      )}
    </li>
  );
}

function NoteRow({
  item,
  text,
  reordering,
  onChange,
  onDelete,
}: {
  item: AssortmentRow;
  text: string;
  reordering: boolean;
  onChange: (text: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `row-${item.id}`, disabled: !reordering });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 bg-amber-50/60 px-2 py-1.5 sm:px-3 dark:bg-amber-950/20",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      {reordering && (
        <RowHandle
          listeners={listeners}
          attributes={attributes}
          label={`Move note ${text || "(empty)"}`}
        />
      )}
      <StickyNoteIcon className="size-4 shrink-0 text-amber-600/70" />
      {reordering ? (
        <span className="flex-1 text-sm italic">{text || "Empty note"}</span>
      ) : (
        <>
          <input
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write something down…"
            aria-label="Note"
            autoFocus={text === ""}
            className="min-w-0 flex-1 bg-transparent text-sm italic outline-none placeholder:not-italic"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={onDelete}
            aria-label="Delete note"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </>
      )}
    </li>
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
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        current === value
          ? "bg-background font-medium shadow-xs ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function OrderSummaryBar({
  lines,
  total,
  onCleared,
}: {
  lines: number;
  total: number;
  onCleared: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm">
          <strong>{lines}</strong> item{lines === 1 ? "" : "s"} to order
          {total > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · about {formatPrice(total)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("Set every amount back to zero?")) return;
              startTransition(async () => {
                const result = await clearOrderList();
                if (result.ok) {
                  onCleared();
                  toast.success("List cleared");
                } else {
                  toast.error(result.error);
                }
              });
            }}
          >
            <XIcon />
            Clear
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/assortment/review" />}
          >
            Review
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
