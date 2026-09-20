"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ImageOffIcon,
  Loader2Icon,
  ShoppingCartIcon,
  StickyNoteIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { OrderReview } from "@/lib/assortment/queries";
import { formatPrice } from "@/lib/format";
import { addOrderToSupplierCart, type CartSubmitResult } from "../actions";

export function ReviewOrder({ review }: { review: OrderReview }) {
  const [resetAmounts, setResetAmounts] = useState(true);
  const [clearNotes, setClearNotes] = useState(false);
  const [result, setResult] = useState<CartSubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  const total = review.lines.reduce(
    (sum, line) => sum + line.quantityToBuy * (line.unitPrice ?? 0),
    0
  );
  const needsAttention = review.manual.length + review.notes.length;

  function submit() {
    startTransition(async () => {
      const response = await addOrderToSupplierCart({
        resetAmounts,
        clearNotes,
        // Order exactly what is on screen, nothing else.
        reviewed: review.lines.map((line) => ({
          id: line.id,
          quantity: line.quantityToBuy,
        })),
      });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setResult(response);
      if (response.failed.length === 0) {
        toast.success(`${response.added.length} products added to the cart`);
      } else {
        toast.error(`${response.failed.length} products could not be added`);
      }
    });
  }

  if (result) {
    return <SubmitResult result={result} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review order</h1>
        <p className="text-sm text-muted-foreground">
          {review.lines.length} product
          {review.lines.length === 1 ? "" : "s"} for the supplier cart
          {total > 0 && <> · about {formatPrice(total)}</>}
        </p>
      </div>

      {needsAttention > 0 && (
        <section className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
          <h2 className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 text-sm font-semibold dark:border-amber-900/50">
            <AlertTriangleIcon className="size-4 text-amber-600" />
            Handle yourself ({needsAttention})
          </h2>
          <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
            {review.manual.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
                  <ImageOffIcon className="size-4 text-muted-foreground/50" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{item.categoryName}</span>
                    <Badge variant="outline" className="text-amber-700">
                      {item.supplierRemoved
                        ? "Gone from catalog"
                        : "Not linked"}
                    </Badge>
                  </div>
                </div>
                <span className="text-lg font-semibold tabular-nums">
                  {item.quantityToBuy}
                </span>
              </li>
            ))}
            {review.notes.map((note) => (
              <li
                key={note.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <StickyNoteIcon className="size-4 shrink-0 text-amber-600/70" />
                <span className="flex-1 italic">
                  {note.name || "Empty note"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {note.categoryName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border bg-background">
        <h2 className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
          <ShoppingCartIcon className="size-4" />
          In m’n mandje! ({review.lines.length})
        </h2>
        <ul className="divide-y">
          {review.lines.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              No products with an amount yet.{" "}
              <Link href="/assortment" className="underline underline-offset-4">
                Back to the list
              </Link>
            </li>
          )}
          {review.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-3 px-3 py-2">
              <ProductImage
                itemNo={line.itemNo!}
                alt={line.supplierDescription ?? line.name}
                hasImage={line.imageStatus !== "none"}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{line.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{line.categoryName}</span>
                  <span>{line.itemNo}</span>
                  {line.unitOfMeasure && <span>{line.unitOfMeasure}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums">
                  {line.quantityToBuy}
                </div>
                {line.unitPrice != null && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatPrice(line.quantityToBuy * line.unitPrice)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border bg-background p-4">
        <Label className="flex items-center gap-3 font-normal">
          <Checkbox
            checked={resetAmounts}
            onCheckedChange={(checked) => setResetAmounts(checked === true)}
          />
          Reset all amounts afterwards
        </Label>
        <Label className="flex items-center gap-3 font-normal">
          <Checkbox
            checked={clearNotes}
            onCheckedChange={(checked) => setClearNotes(checked === true)}
          />
          Delete all notes afterwards
        </Label>

        <Button
          className="w-full"
          size="lg"
          disabled={pending || review.lines.length === 0}
          onClick={submit}
        >
          {pending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <ShoppingCartIcon />
          )}
          {pending
            ? "Adding…"
            : `Add all ${review.lines.length} to the supplier cart`}
        </Button>
        <p className="text-xs text-muted-foreground">
          The products land in the cart at Rust Food. You place the order there
          yourself.
        </p>
      </section>
    </div>
  );
}

function SubmitResult({ result }: { result: CartSubmitResult }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {result.failed.length === 0 ? (
          <CheckCircle2Icon className="size-8 text-emerald-600" />
        ) : (
          <AlertTriangleIcon className="size-8 text-amber-600" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {result.failed.length === 0 ? "In the cart" : "Partly added"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {result.added.length} added
            {result.failed.length > 0 && `, ${result.failed.length} failed`}
            {result.amountsReset > 0 && `, ${result.amountsReset} amounts reset`}
            {result.notesCleared > 0 && `, ${result.notesCleared} notes deleted`}
          </p>
          {result.cart?.totalItems != null && (
            <p className="text-sm text-muted-foreground">
              Cart at Rust Food: {result.cart.totalItems} product
              {result.cart.totalItems === 1 ? "" : "s"}
              {result.cart.totalPrice && ` · ${result.cart.totalPrice}`}
            </p>
          )}
        </div>
      </div>

      {result.failed.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-destructive/40 bg-destructive/5">
          <h2 className="border-b border-destructive/30 px-3 py-2 text-sm font-semibold">
            Not added — do these yourself
          </h2>
          <ul className="divide-y divide-destructive/20">
            {result.failed.map((line) => (
              <li key={line.itemNo} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <XCircleIcon className="size-4 text-destructive" />
                  {line.name} ({line.itemNo}) × {line.quantity}
                </div>
                <div className="pl-6 text-xs text-muted-foreground">
                  {line.error}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.added.length > 0 && (
        <section className="overflow-hidden rounded-lg border bg-background">
          <h2 className="border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
            Added ({result.added.length})
          </h2>
          <ul className="divide-y">
            {result.added.map((line) => (
              <li
                key={line.itemNo}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <CheckCircle2Icon className="size-4 text-emerald-600" />
                <span className="flex-1">{line.name}</span>
                <span className="tabular-nums">× {line.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <Button nativeButton={false} render={<Link href="/assortment" />}>
          Back to the list
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a
              href="https://b2b-rustfood.dinonline.nl/orderconfirm"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Open the cart at Rust Food
        </Button>
      </div>
    </div>
  );
}
