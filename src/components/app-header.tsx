"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/assortment", label: "Assortment" },
  { href: "/pricing", label: "Pricing" },
  { href: "/products", label: "Catalog" },
  { href: "/financials", label: "Rust Financials" },
  { href: "/imports", label: "Imports" },
];

export function AppHeader() {
  const pathname = usePathname();

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
        <nav className="-mr-4 flex min-w-0 items-center gap-1 overflow-x-auto pr-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname.startsWith(item.href) && "bg-muted text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
