"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DISCOUNT_ITEMS = [
  { value: "all", label: "Any discount" },
  { value: "yes", label: "With discount" },
  { value: "no", label: "Without" },
  { value: "unknown", label: "Unknown" },
];

const STATUS_ITEMS = [
  { value: "active", label: "Available" },
  { value: "removed", label: "Removed" },
  { value: "all", label: "All" },
];

export function ProductFilters({ units }: { units: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params}`, { scroll: false });
    });
  }

  // Search on every keystroke: the query takes a few dozen ms, thumbnails load
  // lazily afterwards, and a newer navigation supersedes one still in flight.
  function onQueryChange(value: string) {
    setQuery(value);
    const q = value.trim();
    if (q !== (searchParams.get("q") ?? "")) update({ q: q || null });
  }

  const unitItems = [
    { value: "all", label: "All units" },
    ...units.map((unit) => ({ value: unit, label: unit })),
  ];
  const hasFilters =
    searchParams.has("q") ||
    searchParams.has("unit") ||
    searchParams.has("status") ||
    searchParams.has("assortment") ||
    searchParams.has("discount") ||
    searchParams.has("new");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-64 flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name, item number or barcode…"
          className="bg-background pl-8"
          autoFocus
        />
        {/* Only show the spinner when a search is noticeably slow. */}
        <Loader2Icon
          className={cn(
            "absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground transition-opacity",
            pending ? "opacity-100 delay-300" : "opacity-0"
          )}
        />
      </div>

      <Select
        items={unitItems}
        value={searchParams.get("unit") ?? "all"}
        onValueChange={(value) =>
          update({ unit: value === "all" ? null : (value as string) })
        }
      >
        <SelectTrigger className="w-36 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {unitItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={STATUS_ITEMS}
        value={searchParams.get("status") ?? "active"}
        onValueChange={(value) =>
          update({ status: value === "active" ? null : (value as string) })
        }
      >
        <SelectTrigger className="w-32 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={DISCOUNT_ITEMS}
        value={searchParams.get("discount") ?? "all"}
        onValueChange={(value) =>
          update({ discount: value === "all" ? null : (value as string) })
        }
      >
        <SelectTrigger className="w-36 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DISCOUNT_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={searchParams.get("assortment") === "1"}
          onCheckedChange={(checked) =>
            update({ assortment: checked ? "1" : null })
          }
        />
        In webshop assortment
      </Label>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <XIcon />
          Clear
        </Button>
      )}
    </div>
  );
}
