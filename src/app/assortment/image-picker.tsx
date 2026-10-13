"use client";

import { useEffect, useState, useTransition } from "react";
import { ImagePlusIcon, Loader2Icon, SearchIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ownImageUrl } from "@/components/item-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImageCandidate } from "@/lib/images/search";
import { cn } from "@/lib/utils";
import { removeItemImage, searchItemImages, setItemImage } from "./actions";

// Finds a picture for items the supplier has no image for. The suggestions
// come from the product name, which usually works better than our own short
// label ("Ginger Ale" vs "Schweppes Ginger Ale").
export function ImagePicker({
  itemId,
  hasOwnImage,
  suggestions,
  onChanged,
}: {
  itemId: number;
  hasOwnImage: boolean;
  suggestions: string[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState(suggestions[0] ?? "");
  const [results, setResults] = useState<ImageCandidate[] | null>(null);
  const [current, setCurrent] = useState(hasOwnImage);
  // Cache-busting, so a replaced image doesn't show the old one.
  const [version, setVersion] = useState(0);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  function runSearch(term: string) {
    if (term.trim().length < 2) return;
    startSearch(async () => {
      const response = await searchItemImages(term);
      if (response.ok) setResults(response.results);
      else toast.error(response.error);
    });
  }

  function search(term: string) {
    setQuery(term);
    runSearch(term);
  }

  // Offer something straight away instead of an empty search box.
  useEffect(() => {
    if (!current && suggestions[0]) runSearch(suggestions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(candidate: ImageCandidate) {
    startSave(async () => {
      const result = await setItemImage(
        itemId,
        candidate.imageUrl,
        candidate.source,
        candidate.thumbUrl
      );
      if (result.ok) {
        setCurrent(true);
        setVersion((v) => v + 1);
        setResults(null);
        onChanged();
        toast.success("Image saved");
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startSave(async () => {
      const result = await removeItemImage(itemId);
      if (result.ok) {
        setCurrent(false);
        onChanged();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (current) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={version}
          src={`${ownImageUrl(itemId, "thumb")}&v=${version}`}
          alt="Our own image"
          width={48}
          height={48}
          className="size-12 rounded-md border bg-white object-contain"
        />
        <p className="flex-1 text-sm text-muted-foreground">
          Our own image is in use.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCurrent(false)}
          disabled={saving}
        >
          <SearchIcon />
          Replace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={remove}
          disabled={saving}
          aria-label="Remove image"
        >
          <Trash2Icon />
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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search(query);
            }
          }}
          placeholder="Search an image, or paste a link…"
          className="pl-8"
        />
        {(searching || saving) && (
          <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant={query === suggestion ? "secondary" : "outline"}
            size="xs"
            onClick={() => search(suggestion)}
            disabled={searching || saving}
          >
            {suggestion}
          </Button>
        ))}
        {query.trim().startsWith("http") && (
          <Button
            type="button"
            size="xs"
            onClick={() =>
              choose({
                title: "Pasted link",
                thumbUrl: query.trim(),
                imageUrl: query.trim(),
                source: "link",
              })
            }
            disabled={saving}
          >
            <ImagePlusIcon />
            Use this link
          </Button>
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto rounded-lg border p-2">
          {results.map((candidate) => (
            <li key={candidate.imageUrl}>
              <button
                type="button"
                onClick={() => choose(candidate)}
                disabled={saving}
                title={`${candidate.title} (${candidate.source})`}
                className={cn(
                  "flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-white p-1 transition-colors hover:border-primary",
                  saving && "opacity-50"
                )}
              >
                {/* Not lazy: inside the dialog's own scroll area the
                    browser never gets around to loading them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.thumbUrl}
                  alt={candidate.title}
                  decoding="async"
                  className="size-full object-contain"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {results?.length === 0 && !searching && (
        <p className="text-sm text-muted-foreground">
          Nothing found. Try another search, or paste a link to an image.
        </p>
      )}
    </div>
  );
}
