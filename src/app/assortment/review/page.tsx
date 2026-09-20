import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrderReview } from "@/lib/assortment/queries";
import { ReviewOrder } from "./review-order";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The catalog import and the cart calls run as server actions from this
// page, so they get the platform maximum instead of the default.
export const maxDuration = 60;

export const metadata = { title: "Review order · Inventory Manager" };

export default async function ReviewOrderPage() {
  const review = await getOrderReview();

  return (
    <div className="pb-28">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/assortment" />}
      >
        <ArrowLeftIcon />
        Back to the list
      </Button>
      <ReviewOrder review={review} />
    </div>
  );
}
