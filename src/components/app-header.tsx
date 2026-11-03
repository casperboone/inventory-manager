"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { ScrollRow } from "@/components/scroll-row";
import { findActiveHref } from "@/lib/section-nav";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/order-list", label: "Order list" },
  { href: "/orders", label: "Orders" },
  { href: "/pricing", label: "Pricing" },
  { href: "/catalog", label: "Catalog" },
  { href: "/financials", label: "Rust Financials" },
  { href: "/imports", label: "Imports" },
];

export function AppHeader() {
  const pathname = usePathname();
  const activeHref = findActiveHref(
    pathname,
    NAV.map((item) => item.href),
  );

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <PackageIcon className="size-5" />
          <span className="hidden sm:inline">Inventory Manager</span>
        </Link>
        <nav aria-label="Main" className="-mr-4 min-w-0 text-sm">
          <ScrollRow activeKey={activeHref} className="items-center gap-1 pr-4">
            {NAV.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active || undefined}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </ScrollRow>
        </nav>
      </div>
    </header>
  );
}
