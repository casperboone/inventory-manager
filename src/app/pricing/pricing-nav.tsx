"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/pricing", label: "Prices" },
  { href: "/pricing/categories", label: "Categories & settings" },
];

export function PricingNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {SECTIONS.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
            pathname === section.href
              ? "bg-background font-medium shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
