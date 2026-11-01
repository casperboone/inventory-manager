import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import type { ItemLink } from "@/lib/items/queries";
import { cn } from "@/lib/utils";

// Links also cover items that were archived; those aren't on the list anymore.
export function isOnOurList(items: ItemLink[] | undefined) {
  return !!items?.some((item) => !item.archived);
}

// The one way to the item page, and the only thing in the app in this colour,
// so it reads as the same thing on every screen. Just the arrow when the item's
// name is already right there (pass `name`, for screen readers); otherwise with
// a `label` saying where it leads.
export function OpenItemLink({
  itemId,
  label,
  name,
  className,
}: {
  itemId: number;
  label?: string;
  name?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/items/${itemId}`}
      title="Open item"
      aria-label={label ? undefined : `Open ${name}`}
      className={cn(
        "relative inline-flex max-w-full items-center rounded-md border border-blue-600/25 bg-blue-50 align-middle text-blue-700 transition-colors outline-none hover:bg-blue-100 focus-visible:ring-3 focus-visible:ring-blue-600/30 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25",
        label
          ? "gap-1 px-1.5 py-0.5 text-xs font-medium"
          : // A bigger target than it looks, without taking up more room.
            "size-5 justify-center after:absolute after:-inset-0.5",
        className,
      )}
    >
      {/* A long word may break, rather than widen the table around it. */}
      {label && <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>}
      <ArrowUpRightIcon className="size-3.5 shrink-0" />
    </Link>
  );
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
    <span className={cn("mt-1 flex flex-wrap gap-1.5", className)}>
      {items.map((item) => (
        <OpenItemLink key={item.id} itemId={item.id} label={item.label} />
      ))}
    </span>
  );
}
