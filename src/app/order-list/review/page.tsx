import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNotes } from "@/lib/assortment/queries";
import {
  getCurrentDraftId,
  getDrafts,
  getOrderReview,
  getOrdersPossiblyInCart,
} from "@/lib/orders/drafts";
import { ReviewOrder } from "./review-order";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The catalog import and the cart calls run as server actions from this
// page, so they get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Review order · Inventory Manager" };

export default async function ReviewOrderPage(
  props: PageProps<"/order-list/review">,
) {
  const { order } = await props.searchParams;
  const requested = Number(order);
  const orderId = Number.isInteger(requested) && requested > 0
    ? requested
    : await getCurrentDraftId(await getDrafts());

  const [review, notes, inCart] = await Promise.all([
    orderId == null ? null : getOrderReview(orderId),
    getNotes(),
    orderId == null ? [] : getOrdersPossiblyInCart(orderId),
  ]);

  return (
    <div className="pb-28">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/order-list" />}
      >
        <ArrowLeftIcon />
        Back to the list
      </Button>
      {review ? (
        <ReviewOrder review={review} notes={notes} inCart={inCart} />
      ) : (
        <p className="rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          There&apos;s no order to review yet.
        </p>
      )}
    </div>
  );
}
