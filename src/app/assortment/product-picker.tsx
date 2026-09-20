"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import type { PickerProduct } from "@/lib/assortment/queries";
import { searchCatalog } from "./actions";

// Links an assortment item to a product in the supplier catalog.
export function ProductPicker({
  value,
  onChange,
  suggestion,
}: {
  value: PickerProduct | null;
  onChange: (product: PickerProduct | null) => void;
  // Prefills the search when nothing is linked yet, usually the item's name.
  suggestion?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [pending, startTransition] = useTransition();

  const term = query.trim();
  // Results belong to the current term; shorter terms simply show nothing.
  const visibleResults = term.length >= 2 ? results : [];

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const result = await searchCatalog(term);
        if (result.ok) setResults(result.data);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2">
        <ProductImage
          itemNo={value.itemNo}
          alt={value.description}
          hasImage={value.imageStatus !== "none"}
        />
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-medium">{value.description}</div>
          <div className="text-xs text-muted-foreground">
            {value.itemNo} · {value.unitOfMeasure ?? "—"} ·{" "}
            {formatPrice(value.unitPrice)}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
        >
          <XIcon />
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the supplier catalog…"
          className="pl-8"
        />
        {pending && (
          <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {term.length < 2 && suggestion && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setQuery(suggestion)}
        >
          <SearchIcon />
          Search for “{suggestion}”
        </Button>
      )}

      {visibleResults.length > 0 && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
          {visibleResults.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onChange(product)}
                className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted/60"
              >
                <ProductImage
                  itemNo={product.itemNo}
                  alt={product.description}
                  hasImage={product.imageStatus !== "none"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {product.description}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {product.itemNo} · {product.unitOfMeasure ?? "—"} ·{" "}
                    {formatPrice(product.unitPrice)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {term.length >= 2 && !pending && visibleResults.length === 0 && (
        <p className="text-sm text-muted-foreground">No products found.</p>
      )}
    </div>
  );
}
