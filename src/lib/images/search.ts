import { logger } from "@/lib/logger";

// Open Food Facts and its non-food sibling are free product databases with
// photos, which fits a catalog of drinks, snacks and cleaning supplies far
// better than a general image search. Both are used without a key; a Google
// Custom Search key can be added for anything they don't have.
const USER_AGENT =
  "InventoryManager/0.1 (self-hosted stock tool; contact via app owner)";
const TIMEOUT_MS = 8000;

export type ImageCandidate = {
  title: string;
  // Small preview shown in the picker.
  thumbUrl: string;
  // What we download and store when it gets picked.
  imageUrl: string;
  source: string;
};

// Pack sizes, units and webshop shorthand that only hurt an image search:
// "SCHWEPPES GINGER ALE 24/20CL" is found, "24/20CL" is not. Ordered from
// most specific to least, so a pack size is swallowed whole and meaningful
// numbers ("Amstel 0.0", "Licor 43") survive.
const UNIT = "cl|ml|ltr|lt|l|kg|gr|g|st|stk|stuks|vel|pers|pak";
const NOISE = new RegExp(
  [
    // 24/20CL, 12x1LTR, 36X350VEL
    `\\b\\d+[.,]?\\d*\\s?[x×*/]\\s?\\d+[.,]?\\d*\\s?(${UNIT})?\\b`,
    // 50LTR, 750GR, 20CL
    `\\b\\d+[.,]?\\d*\\s?(${UNIT})\\b`,
    // Containers and webshop shorthand.
    "\\b(fust|krat|tray|doos|blik|fles|bak|zak|rol|pot|emmer|bus|tube|kist|krimp|tank|aio|pet|statiegeld|scan|ow)\\b",
  ].join("|"),
  "gi"
);

export function cleanProductName(value: string): string {
  return value
    .toLowerCase()
    .replace(NOISE, " ")
    // Keep dots that are part of a number ("amstel radler 0.0").
    .replace(/[^\p{L}\p{N}%&'’+.\- ]+/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// A couple of queries to offer, best first: the supplier's product name
// usually works better than our own short label.
export function suggestQueries(input: {
  name: string;
  supplierDescription?: string | null;
}): string[] {
  const suggestions: string[] = [];
  const add = (value: string) => {
    const cleaned = cleanProductName(value);
    if (cleaned.length >= 3 && !suggestions.includes(cleaned)) {
      suggestions.push(cleaned);
    }
  };

  if (input.supplierDescription) {
    add(input.supplierDescription);
    // Brand plus product, without the trailing details.
    const words = cleanProductName(input.supplierDescription).split(" ");
    if (words.length > 2) add(words.slice(0, 2).join(" "));
  }
  add(input.name);

  return suggestions.slice(0, 3);
}

async function fetchJson(
  url: string,
  onForbidden?: () => void
): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 403 && onForbidden) onForbidden();
      else logger.warn(`Image search ${new URL(url).host}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    logger.warn(
      `Image search ${new URL(url).host}: ${error instanceof Error ? error.message : error}`
    );
    return null;
  }
}

// Open Food Facts' search service: food and drink.
async function searchOpenFoodFacts(query: string): Promise<ImageCandidate[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=20&fields=product_name,brands,image_url`;
  const body = (await fetchJson(url)) as
    | { hits?: { product_name?: string; brands?: string[]; image_url?: string }[] }
    | null;

  return (body?.hits ?? [])
    .filter((hit) => hit.image_url)
    .map((hit) => ({
      title: [hit.brands?.[0], hit.product_name].filter(Boolean).join(" · "),
      thumbUrl: resizeOpenFacts(hit.image_url!, 200),
      imageUrl: resizeOpenFacts(hit.image_url!, "full"),
      source: "Open Food Facts",
    }));
}

// The same project for non-food products: cleaning supplies, paper, soap.
async function searchOpenProductsFacts(
  query: string
): Promise<ImageCandidate[]> {
  const url = `https://world.openproductsfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,brands,image_front_url`;
  const body = (await fetchJson(url)) as
    | {
        products?: {
          product_name?: string;
          brands?: string;
          image_front_url?: string;
        }[];
      }
    | null;

  return (body?.products ?? [])
    .filter((product) => product.image_front_url)
    .map((product) => ({
      title: [product.brands, product.product_name]
        .filter(Boolean)
        .join(" · "),
      thumbUrl: resizeOpenFacts(product.image_front_url!, 200),
      imageUrl: resizeOpenFacts(product.image_front_url!, "full"),
      source: "Open Products Facts",
    }));
}

// Image URLs end in a size: .200.jpg, .400.jpg or .full.jpg. Only those exist,
// so asking for another size gives a 404.
function resizeOpenFacts(url: string, size: 200 | 400 | "full") {
  return url.replace(/\.(\d+|full)\.jpg$/i, `.${size}.jpg`);
}

// A general image search (Google results through Serper), for products the
// product databases don't have or match badly. Needs SERPER_API_KEY; skipped
// when it isn't set. Google's own Custom Search JSON API is closed to new
// customers since 2026, which is why this goes through Serper.
async function searchSerperImages(query: string): Promise<ImageCandidate[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const response = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": key, "content-type": "application/json" },
      body: JSON.stringify({ q: query, gl: "nl", hl: "nl", num: 20 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      logger.warn(`Image search serper: ${response.status}`);
      return [];
    }
    const body = (await response.json()) as {
      images?: {
        title?: string;
        imageUrl?: string;
        thumbnailUrl?: string;
        domain?: string;
      }[];
    };
    return (body.images ?? [])
      .filter((image) => image.imageUrl)
      .map((image) => ({
        title: image.title ?? query,
        thumbUrl: image.thumbnailUrl ?? image.imageUrl!,
        imageUrl: image.imageUrl!,
        source: image.domain ?? "Google",
      }));
  } catch (error) {
    logger.warn(
      `Image search serper: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

// Optional: a general image search, for products neither database knows.
// Needs GOOGLE_CSE_KEY and GOOGLE_CSE_ID; skipped when they aren't set.
// Google closed this API to new customers in 2026; a project without access
// answers 403 on every call, so stop asking after the first refusal.
let googleUnavailable = false;

async function searchGoogleImages(query: string): Promise<ImageCandidate[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx || googleUnavailable) return [];

  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=10&safe=active&q=${encodeURIComponent(query)}`;
  const body = (await fetchJson(url, () => {
    googleUnavailable = true;
    logger.warn(
      "Google Custom Search is not available for this key; skipping it from now on."
    );
  })) as
    | {
        items?: {
          title?: string;
          link?: string;
          image?: { thumbnailLink?: string };
        }[];
      }
    | null;

  return (body?.items ?? [])
    .filter((item) => item.link)
    .map((item) => ({
      title: item.title ?? query,
      thumbUrl: item.image?.thumbnailLink ?? item.link!,
      imageUrl: item.link!,
      source: "Google",
    }));
}

// Repeating the same search (reopening an item, clicking back to a chip)
// shouldn't cost another API call; Google's free tier is 100 a day.
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; results: ImageCandidate[] }>();

export async function searchProductImages(
  query: string
): Promise<ImageCandidate[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const cached = cache.get(term);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  // A general image search gives the best match when it is configured, so its
  // results come first; the product databases fill up the rest.
  const [serper, google, openFood, openProducts] = await Promise.all([
    searchSerperImages(term),
    searchGoogleImages(term),
    searchOpenFoodFacts(term),
    searchOpenProductsFacts(term),
  ]);

  const merged: ImageCandidate[] = [];
  const seen = new Set<string>();
  const take = (candidates: ImageCandidate[], limit: number) => {
    let taken = 0;
    for (const candidate of candidates) {
      if (taken >= limit || seen.has(candidate.imageUrl)) continue;
      seen.add(candidate.imageUrl);
      merged.push(candidate);
      taken++;
    }
  };

  take(serper, 16);
  take(google, 12);
  // Interleave the two product databases so neither fills the remainder.
  for (let i = 0; i < 12; i++) {
    take(openFood.slice(i, i + 1), 1);
    take(openProducts.slice(i, i + 1), 1);
  }
  const results = merged.slice(0, 24);
  if (results.length > 0) {
    cache.set(term, { at: Date.now(), results });
    // Keep the cache small; this runs per server instance.
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
  }
  return results;
}
