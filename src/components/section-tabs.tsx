"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabClass = (active: boolean) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
    active
      ? "bg-background font-medium shadow-xs ring-1 ring-border"
      : "text-muted-foreground hover:text-foreground",
  );

// The links between the pages of a section. "prefix" keeps a section lit on
// the pages below it; "exact" is for when one section's link is the start of
// the others.
export function SectionNav({
  sections,
  match,
}: {
  sections: { href: string; label: string }[];
  match: "exact" | "prefix";
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className={tabClass(
            match === "exact"
              ? pathname === section.href
              : pathname.startsWith(section.href),
          )}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

// Switches between views of a list on the same page.
export function ViewTab<View extends string>({
  current,
  value,
  onSelect,
  children,
}: {
  current: View;
  value: View;
  onSelect: (view: View) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={tabClass(current === value)}
    >
      {children}
    </button>
  );
}
