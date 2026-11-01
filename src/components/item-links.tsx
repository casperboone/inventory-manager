import Link from "next/link";
import { ArrowUpRightIcon, CornerDownRightIcon } from "lucide-react";
import type { ItemLink } from "@/lib/items/queries";
import { cn } from "@/lib/utils";

// Links also cover items that were archived; those aren't on the list anymore.
export function isOnOurList(items: ItemLink[] | undefined) {
  return !!items?.some((item) => !item.archived);
}

// The items a supplier product belongs to, as a line under its description.
// Most products in the catalog have none, and then this shows nothing.
export function ItemLinks({
  items,
  className,
}: {
  items: ItemLink[] | undefined;
  className?: string;
}) {
  if (!items?.length) return null;
  return (
    <span
      className={cn(
        "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs",
        className,
      )}
    >
      <CornerDownRightIcon className="size-3 shrink-0 text-muted-foreground" />
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/items/${item.id}`}
          className="py-0.5 font-medium underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
        >
          {item.label}
        </Link>
      ))}
    </span>
  );
}

// From an edit dialog to the page with everything about the item.
export function OpenItemLink({ itemId }: { itemId: number }) {
  return (
    <Link
      href={`/items/${itemId}`}
      className="inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
    >
      Open item
      <ArrowUpRightIcon className="size-3.5" />
    </Link>
  );
}
