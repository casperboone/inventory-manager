import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supplierProducts } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  getCachedProductImage,
  getProductImage,
} from "@/lib/supplier/image-service";

// Browsers may keep images for a day; the server-side cache handles freshness.
const CACHE_CONTROL = "private, max-age=86400";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/product-images/[itemNo]">
) {
  const { itemNo } = await ctx.params;
  const variant =
    new URL(request.url).searchParams.get("size") === "thumb" ? "thumb" : "full";

  // Only proxy images of products we know; this also rules out odd paths.
  const product = await db.query.supplierProducts.findFirst({
    where: eq(supplierProducts.itemNo, itemNo),
    columns: { id: true },
  });
  if (!product || !/^[\w.-]+$/.test(itemNo) || itemNo.startsWith(".")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const image = await getCachedProductImage(itemNo, variant);
    if ("pending" in image) {
      // `after` keeps the fetch alive past the response, also on serverless.
      after(async () => {
        try {
          await getProductImage(itemNo, variant);
        } catch (error) {
          logger.warn(
            `Background image fetch ${itemNo}: ${error instanceof Error ? error.message : error}`
          );
        }
      });
    }
    if (!image.found) {
      // 202: the image is being fetched from the supplier; the client retries.
      const pending = "pending" in image;
      return new Response(pending ? "Fetching" : "No image", {
        status: pending ? 202 : 404,
        headers: {
          "cache-control": pending ? "no-store" : CACHE_CONTROL,
          "x-image-status": pending ? "pending" : "none",
        },
      });
    }
    return new Response(new Uint8Array(image.body), {
      headers: {
        "content-type": image.contentType,
        "cache-control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    logger.error(
      `Product image ${itemNo}: ${error instanceof Error ? error.message : error}`
    );
    return new Response("Image unavailable", { status: 502 });
  }
}
