import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import type { ItemLink } from "@/lib/items/queries";
import { cn } from "@/lib/utils";

// The one way to the item page: an arrow after a name, everywhere. Just the
// arrow when the item's name is already right there (pass `name`, for screen
// readers); otherwise with a `label` saying where it leads.
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
  const arrow = (
    <ArrowUpRightIcon
      className={cn(
        "inline size-3.5 align-text-bottom text-muted-foreground group-hover/open:text-foreground",
        label && "ml-0.5",
      )}
    />
  );
  // Glued to the last word, so a long label can't wrap and leave it behind.
  const words = label?.split(" ") ?? [];
  const lastWord = words.pop();

  return (
    <Link
      href={`/items/${itemId}`}
      title="Open item"
      aria-label={label ? undefined : `Open ${name}`}
      className={cn(
        "group/open underline-offset-2 hover:underline",
        // Just the arrow gets a bigger target, without taking up more room.
        label ? "font-medium" : "-m-1 inline-flex p-1",
        className,
      )}
    >
      {label ? (
        <>
          {words.join(" ")}{" "}
          <span className="whitespace-nowrap">
            {lastWord}
            {arrow}
          </span>
        </>
      ) : (
        arrow
      )}
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
    <span className={cn("mt-0.5 flex flex-wrap gap-x-3 text-xs", className)}>
      {items.map((item) => (
        <OpenItemLink key={item.id} itemId={item.id} label={item.label} />
      ))}
    </span>
  );
}
