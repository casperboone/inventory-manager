"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  ShoppingCartIcon,
  StickyNoteIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ItemImage } from "@/components/item-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatNumber, formatPrice } from "@/lib/format";
import type { OrderReview, ReviewLine } from "@/lib/orders/drafts";
import { orderLabel } from "@/lib/orders/reference";
import { sendOrderToCart, type CartSubmitResult } from "../actions";

const RUST_CHECKOUT = "https://b2b-rustfood.dinonline.nl/orderconfirm";

const amounts = (lines: ReviewLine[]) =>
  lines.map((line) => ({ id: line.id, quantity: line.quantity }));

export function ReviewOrder({
  review,
  notes,
  inCart,
}: {
  review: OrderReview;
  notes: { id: number; name: string; categoryName: string }[];
  // Other orders that may still be sitting in the cart.
  inCart: { id: number; name: string | null }[];
}) {
  const [clearNotes, setClearNotes] = useState(false);
  const [result, setResult] = useState<CartSubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  const total = review.lines.reduce(
    (sum, line) => sum + line.quantity * (line.unitPrice ?? 0),
    0,
  );
  const needsAttention = review.manual.length + notes.length;
  const nothingToSend = review.lines.length === 0 && review.manual.length === 0;

  function submit() {
    startTransition(async () => {
      const response = await sendOrderToCart({
        orderId: review.order.id,
        clearNotes,
        // Order exactly what is on screen, nothing else.
        reviewed: amounts(review.lines),
        reviewedManual: amounts(review.manual),
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Review {orderLabel(review.order)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {review.lines.length} product
          {review.lines.length === 1 ? "" : "s"} for the supplier cart
          {total > 0 && <> · about {formatPrice(total)}</>}
        </p>
      </div>

      {inCart.length > 0 && review.lines.length > 0 && (
        <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            {inCart.map(orderLabel).join(", ")} went to the cart too, and Rust
            shows nothing for {inCart.length === 1 ? "it" : "them"} yet. If{" "}
            {inCart.length === 1 ? "it hasn't" : "they haven't"} been placed,
            this ends up on the same Rust order.
          </span>
        </p>
      )}

      {needsAttention > 0 && (
        <section className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
          <h2 className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 text-sm font-semibold dark:border-amber-900/50">
            <AlertTriangleIcon className="size-4 text-amber-600" />
            Handle yourself ({needsAttention})
          </h2>
          <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
            {review.manual.map((line) => (
              <li key={line.id} className="flex items-center gap-3 px-3 py-2">
                <ItemImage
                  itemId={line.itemId ?? 0}
                  itemNo={line.itemNo}
                  hasOwnImage={line.hasOwnImage}
                  imageStatus={line.imageStatus}
                  alt={line.name}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{line.name}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {line.categoryName && <span>{line.categoryName}</span>}
                    {line.source && <span>{line.source}</span>}
                    <Badge variant="outline" className="text-amber-700">
                      {line.supplierRemoved
                        ? "Gone from catalog"
                        : line.itemId
                          ? "Not linked"
                          : "One-off"}
                    </Badge>
                  </div>
                </div>
                <span className="text-lg font-semibold tabular-nums">
                  {formatNumber(line.quantity)}
                </span>
              </li>
            ))}
            {notes.map((note) => (
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
              Nothing for the cart.{" "}
              <Link href="/order-list" className="underline underline-offset-4">
                Back to the list
              </Link>
            </li>
          )}
          {review.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-3 px-3 py-2">
              <ItemImage
                itemId={line.itemId ?? 0}
                itemNo={line.itemNo}
                hasOwnImage={line.hasOwnImage}
                imageStatus={line.imageStatus}
                alt={line.name}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{line.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {line.categoryName && <span>{line.categoryName}</span>}
                  <span>{line.itemNo}</span>
                  {line.unitOfMeasure && <span>{line.unitOfMeasure}</span>}
                  {!line.itemId && <Badge variant="outline">One-off</Badge>}
                </div>
                {line.cartError && (
                  <div className="text-xs text-destructive">
                    Last try: {line.cartError}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums">
                  {formatNumber(line.quantity)}
                </div>
                {line.unitPrice != null && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatPrice(line.quantity * line.unitPrice)}
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
            checked={clearNotes}
            onCheckedChange={(checked) => setClearNotes(checked === true)}
          />
          Delete all notes afterwards
        </Label>

        <Button
          className="w-full"
          size="lg"
          disabled={pending || nothingToSend}
          onClick={submit}
        >
          {pending ? (
            <Loader2Icon className="animate-spin" />
          ) : review.lines.length > 0 ? (
            <ShoppingCartIcon />
          ) : (
            <CheckIcon />
          )}
          {pending
            ? "Adding…"
            : review.lines.length > 0
              ? `Add all ${review.lines.length} to the supplier cart`
              : "Mark as handled by me"}
        </Button>
        <p className="text-xs text-muted-foreground">
          The products land in the cart at Rust Food. You place the order there
          yourself. The order keeps these amounts, and you start a new one with
          your next tap on the list.
        </p>
      </section>
    </div>
  );
}

function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      size="lg"
      variant="outline"
      className="font-mono"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(reference);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error(`Couldn't copy. Type it instead: ${reference}`);
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {reference}
    </Button>
  );
}

function SubmitResult({ result }: { result: CartSubmitResult }) {
  const reachedCart = result.added.length > 0;

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
            {result.failed.length > 0
              ? "Partly added"
              : reachedCart
                ? "In the cart"
                : "Done"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {result.added.length} added
            {result.failed.length > 0 && `, ${result.failed.length} failed`}
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

      {reachedCart && (
        <section className="space-y-3 rounded-lg border bg-background p-4">
          <p className="text-sm">
            Paste this into <strong>Uw referentie</strong> at Rust&apos;s
            checkout. It ties their order and invoice to this one.
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyReference reference={result.reference} />
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={RUST_CHECKOUT} target="_blank" rel="noreferrer" />}
            >
              Open the cart at Rust Food
            </Button>
          </div>
        </section>
      )}

      {result.failed.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-destructive/40 bg-destructive/5">
          <h2 className="border-b border-destructive/30 px-3 py-2 text-sm font-semibold">
            Not added
          </h2>
          <ul className="divide-y divide-destructive/20">
            {result.failed.map((line, index) => (
              <li key={index} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <XCircleIcon className="size-4 text-destructive" />
                  {line.name} ({line.itemNo}) × {formatNumber(line.quantity)}
                </div>
                <div className="pl-6 text-xs text-muted-foreground">
                  {line.error}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-destructive/30 px-3 py-2 text-xs text-muted-foreground">
            These stay on the order. Try again from{" "}
            <Link
              href={`/order-list/review?order=${result.orderId}`}
              className="underline underline-offset-4"
            >
              the review
            </Link>{" "}
            after a reload, or add them at Rust yourself.
          </p>
        </section>
      )}

      {result.added.length > 0 && (
        <section className="overflow-hidden rounded-lg border bg-background">
          <h2 className="border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
            Added ({result.added.length})
          </h2>
          <ul className="divide-y">
            {result.added.map((line, index) => (
              <li
                key={index}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <CheckCircle2Icon className="size-4 text-emerald-600" />
                <span className="flex-1">{line.name}</span>
                <span className="tabular-nums">
                  × {formatNumber(line.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href="/order-list" />}
      >
        Back to the list
      </Button>
    </div>
  );
}
