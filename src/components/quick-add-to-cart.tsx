"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MinusIcon, PlusIcon, ShoppingCartIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { quickAddToCart } from "@/app/products/actions";
import { cn } from "@/lib/utils";

// Puts a catalog product straight into the cart at the supplier, without
// going through the assortment.
export function QuickAddToCart({
  itemNo,
  description,
  unitOfMeasure,
  disabled,
}: {
  itemNo: string;
  description: string;
  unitOfMeasure?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await quickAddToCart(itemNo, quantity);
      if (!result.ok) {
        toast.error(result.error, { description });
        return;
      }
      const { totalItems, totalPrice } = result.cart;
      toast.success(`${quantity}× ${description} added`, {
        description:
          totalItems != null
            ? `Cart at Rust Food: ${totalItems} product${totalItems === 1 ? "" : "s"}${totalPrice ? ` · ${totalPrice}` : ""}`
            : undefined,
      });
      setOpen(false);
      setQuantity(1);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8", disabled && "pointer-events-none opacity-30")}
            aria-label={`Add ${description} to the cart`}
            disabled={disabled}
          />
        }
      >
        <ShoppingCartIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
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
              const parsed = Number(e.target.value.trim().replace(",", "."));
              if (Number.isFinite(parsed)) setQuantity(Math.max(0, parsed));
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
        <Button
          className="mt-3 w-full"
          onClick={add}
          disabled={pending || quantity <= 0}
        >
          {pending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <ShoppingCartIcon />
          )}
          Add to cart
        </Button>
      </PopoverContent>
    </Popover>
  );
}
