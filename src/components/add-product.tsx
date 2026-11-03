"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ListPlusIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { quickAddToCart } from "@/app/catalog/actions";
import {
  addOneOff,
  createDraft,
  loadOrderChoices,
} from "@/app/order-list/actions";
import { formatNumber } from "@/lib/format";
import { parseTypedNumber } from "@/lib/numbers";
import type { DraftSummary } from "@/lib/orders/drafts";
import { orderLabel } from "@/lib/orders/reference";
import { cn } from "@/lib/utils";

const NEW_ORDER = "new";

// Puts a catalog product on an order, as a one-off. Going straight to the cart
// at the supplier is there too, for what doesn't need following up on.
export function AddProduct({
  productId,
  itemNo,
  description,
  unitOfMeasure,
  disabled,
}: {
  productId: number;
  itemNo: string;
  description: string;
  unitOfMeasure?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [orderChoice, setOrderChoice] = useState(NEW_ORDER);
  const [pending, startTransition] = useTransition();

  // Only when opened: this sits on every row of the catalog.
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setDrafts(null);
    startTransition(async () => {
      const result = await loadOrderChoices();
      if (!result.ok) {
        toast.error(result.error);
        setDrafts([]);
        return;
      }
      setDrafts(result.drafts);
      setOrderChoice(
        result.currentOrderId == null ? NEW_ORDER : String(result.currentOrderId),
      );
    });
  }

  function done() {
    setOpen(false);
    setQuantity(1);
  }

  function addToOrder() {
    startTransition(async () => {
      let orderId = Number(orderChoice);
      let label = drafts?.find((draft) => draft.id === orderId);
      if (orderChoice === NEW_ORDER) {
        const created = await createDraft();
        if (!created.ok) {
          toast.error(created.error, { description });
          return;
        }
        orderId = created.orderId;
        label = undefined;
      }
      const result = await addOneOff({
        orderId,
        productId,
        name: "",
        source: "",
        quantity,
        remember: true,
      });
      if (!result.ok) {
        toast.error(result.error, { description });
        return;
      }
      toast.success(`${formatNumber(quantity)}× ${description} added`, {
        description: orderLabel(label ?? { id: orderId, name: null }),
        action: {
          label: "Open",
          onClick: () => router.push(`/orders/${orderId}`),
        },
      });
      done();
    });
  }

  function addToCart() {
    startTransition(async () => {
      const result = await quickAddToCart(itemNo, quantity);
      if (!result.ok) {
        toast.error(result.error, { description });
        return;
      }
      const { totalItems, totalPrice } = result.cart;
      toast.success(`${formatNumber(quantity)}× ${description} in the cart`, {
        description:
          totalItems != null
            ? `Cart at Rust Food: ${totalItems} product${totalItems === 1 ? "" : "s"}${totalPrice ? ` · ${totalPrice}` : ""}`
            : undefined,
      });
      done();
    });
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className={cn("size-8", disabled && "pointer-events-none opacity-30")}
            aria-label={`Add ${description}`}
            disabled={disabled}
          />
        }
      >
        <PlusIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 line-clamp-2 text-sm font-medium">{description}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            disabled={quantity <= 1}
            aria-label="One less"
          >
            <MinusIcon />
          </Button>
          <input
            value={quantity}
            onChange={(e) => {
              const parsed =
                e.target.value.trim() === ""
                  ? 0
                  : parseTypedNumber(e.target.value);
              if (parsed != null) setQuantity(Math.max(0, parsed));
            }}
            inputMode="decimal"
            aria-label="Amount"
            className="h-9 w-12 rounded-md border bg-background text-center text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setQuantity((value) => value + 1)}
            aria-label="One more"
          >
            <PlusIcon />
          </Button>
          <span className="text-xs text-muted-foreground">
            {unitOfMeasure ?? ""}
          </span>
        </div>

        <select
          value={orderChoice}
          onChange={(e) => setOrderChoice(e.target.value)}
          disabled={drafts === null}
          aria-label="Order to add it to"
          className="mt-3 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {drafts?.map((draft) => (
            <option key={draft.id} value={draft.id}>
              {orderLabel(draft)} ({draft.lineCount})
            </option>
          ))}
          <option value={NEW_ORDER}>New order</option>
        </select>
        <Button
          className="mt-2 w-full"
          onClick={addToOrder}
          disabled={pending || drafts === null || quantity <= 0}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <ListPlusIcon />}
          Add to order
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-muted-foreground"
          onClick={addToCart}
          disabled={pending || quantity <= 0}
        >
          <ShoppingCartIcon />
          Straight to Rust&apos;s cart
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Not tracked on any order.
        </p>
      </PopoverContent>
    </Popover>
  );
}
