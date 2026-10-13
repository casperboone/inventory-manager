import { readItemImage } from "@/lib/images/store";

// Our own images are stored ready to use, so they can be cached hard.
const CACHE_CONTROL = "private, max-age=86400";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/assortment-images/[itemId]">
) {
  const { itemId } = await ctx.params;
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const variant =
    new URL(request.url).searchParams.get("size") === "thumb"
      ? "thumb"
      : "full";
  const image = await readItemImage(id, variant);
  if (!image) return new Response("No image", { status: 404 });

  return new Response(new Uint8Array(image), {
    headers: { "content-type": "image/webp", "cache-control": CACHE_CONTROL },
  });
}
