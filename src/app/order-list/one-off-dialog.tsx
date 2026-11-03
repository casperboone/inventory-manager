"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
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
import type { PickerProduct } from "@/lib/assortment/queries";
import { parseTypedNumber } from "@/lib/numbers";
import { addOneOff } from "./actions";
import { ProductPicker } from "./product-picker";

export function OneOffDialog({
  open,
  orderId,
  onAdded,
  onClose,
}: {
  open: boolean;
  orderId: number | null;
  onAdded: (orderId: number) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        {/* Remounting gives each one-off an empty form. */}
        {open && (
          <OneOffForm orderId={orderId} onAdded={onAdded} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OneOffForm({
  orderId,
  onAdded,
  onClose,
}: {
  orderId: number | null;
  onAdded: (orderId: number) => void;
  onClose: () => void;
}) {
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [pending, startTransition] = useTransition();

  const amount = parseTypedNumber(quantity);
  const canAdd =
    (product != null || name.trim() !== "") && amount != null && amount > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canAdd) return;
    startTransition(async () => {
      const result = await addOneOff({
        orderId,
        productId: product?.id ?? null,
        name,
        source,
        quantity: amount,
      });
      if (result.ok) onAdded(result.orderId);
      else toast.error(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add a one-off</DialogTitle>
        <DialogDescription>
          For this order only. It stays off the list.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-1 min-h-0 space-y-4 overflow-y-auto px-1">
        <div className="space-y-2">
          <Label>From the catalog</Label>
          <ProductPicker value={product} onChange={setProduct} />
        </div>

        {!product && (
          <>
            <div className="space-y-2">
              <Label htmlFor="one-off-name">Or something else</Label>
              <Input
                id="one-off-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What is it?"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                This doesn&apos;t go to the cart. You tick it off yourself.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="one-off-source">Bought at (optional)</Label>
              <Input
                id="one-off-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Where from?"
                maxLength={200}
              />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="one-off-quantity">Amount</Label>
          <Input
            id="one-off-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            className="w-24"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !canAdd}>
          {pending && <Loader2Icon className="animate-spin" />}
          Add to the order
        </Button>
      </DialogFooter>
    </form>
  );
}
