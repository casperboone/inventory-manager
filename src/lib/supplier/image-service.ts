import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { supplierProductImages, supplierProducts } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  getSupplierSession,
  isLoginRedirect,
  resetSupplierSession,
} from "./session";

// Supplier images are cached in the database: a small webp thumbnail for
// listings plus the original for the larger preview. Keeping them out of the
// filesystem means they survive on hosting without a persistent disk.
const DAY_MS = 24 * 60 * 60 * 1000;
const IMAGE_TTL_MS = 30 * DAY_MS;
// Products without an image may get one later.
export const NO_IMAGE_TTL_MS = 7 * DAY_MS;
const MAX_CONCURRENT_FETCHES = 4;
const THUMB_SIZE = 96;
// The large version only feeds a 256px preview, so it is re-encoded rather
// than stored as the supplier sends it: a 250 KB PNG becomes ~15 KB of webp,
// which keeps the database small even with the whole catalog cached.
export const FULL_SIZE = 500;

// "(NOG) GEEN AFBEELDING BESCHIKBAAR" GIF the supplier serves for items
// without an image.
const PLACEHOLDER_SHA1 = "f6ed843341026d0c99ddfa00907988608ed6b797";

export type ImageVariant = "full" | "thumb";

export type ProductImage =
  | { found: true; body: Buffer; contentType: string }
  | { found: false };

export type ProductImageResult = ProductImage | { found: false; pending: true };

// The supplier labels everything image/Jpeg, but serves PNG, JPEG and GIF.
function sniffContentType(body: Buffer): string | null {
  if (body.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
    return "image/png";
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (body.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (
    body.subarray(0, 4).toString("latin1") === "RIFF" &&
    body.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return null;
}

async function makeThumb(body: Buffer) {
  return sharp(body)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function makeFull(body: Buffer) {
  return sharp(body)
    .resize(FULL_SIZE, FULL_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

type CachedImage = {
  thumb: Buffer;
  full: Buffer | null;
  fullContentType: string | null;
  fresh: boolean;
};

async function readCache(itemNo: string): Promise<CachedImage | null> {
  const row = await db.query.supplierProductImages.findFirst({
    where: eq(supplierProductImages.itemNo, itemNo),
  });
  if (!row) return null;
  return {
    thumb: Buffer.from(row.thumb),
    full: row.full ? Buffer.from(row.full) : null,
    fullContentType: row.fullContentType,
    fresh: Date.now() - row.fetchedAt.getTime() < IMAGE_TTL_MS,
  };
}

// Products the supplier has no image for are only remembered on the product
// itself; they get re-checked after a while.
async function isKnownWithoutImage(itemNo: string) {
  const product = await db.query.supplierProducts.findFirst({
    where: eq(supplierProducts.itemNo, itemNo),
    columns: { imageStatus: true, imageCheckedAt: true },
  });
  return (
    product?.imageStatus === "none" &&
    !!product.imageCheckedAt &&
    Date.now() - product.imageCheckedAt.getTime() < NO_IMAGE_TTL_MS
  );
}

function toResult(cached: CachedImage, variant: ImageVariant): ProductImage {
  if (variant === "thumb") {
    return { found: true, body: cached.thumb, contentType: "image/webp" };
  }
  return cached.full
    ? {
        found: true,
        body: cached.full,
        contentType: cached.fullContentType ?? "image/jpeg",
      }
    : { found: true, body: cached.thumb, contentType: "image/webp" };
}

// Minimal semaphore so a page full of new images doesn't flood the supplier.
let active = 0;
const queue: (() => void)[] = [];
async function withFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

async function fetchFromSupplier(
  itemNo: string,
  retry = true
): Promise<Buffer | null> {
  const session = getSupplierSession();
  const http = await session;
  const response = await http.get(
    `/Product/GetImage/${encodeURIComponent(itemNo)}`,
    { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
  );

  if (isLoginRedirect(response)) {
    resetSupplierSession(session);
    if (retry) return fetchFromSupplier(itemNo, false);
    throw new Error("Supplier session could not be re-established.");
  }
  if (!response.ok) {
    throw new Error(`Image fetch for ${itemNo} failed: ${response.status}.`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const contentType = sniffContentType(body);
  if (!contentType) {
    throw new Error(`Image fetch for ${itemNo} returned no image.`);
  }
  // null means: the supplier has no image for this product.
  const isPlaceholder =
    createHash("sha1").update(body).digest("hex") === PLACEHOLDER_SHA1;
  return isPlaceholder ? null : body;
}

async function store(itemNo: string, body: Buffer | null) {
  const now = new Date();
  if (!body) {
    await db
      .update(supplierProducts)
      .set({ imageStatus: "none", imageCheckedAt: now })
      .where(eq(supplierProducts.itemNo, itemNo));
    return null;
  }

  const [thumb, full] = await Promise.all([makeThumb(body), makeFull(body)]);
  const cached: CachedImage = {
    thumb,
    full,
    fullContentType: "image/webp",
    fresh: true,
  };

  await db
    .insert(supplierProductImages)
    .values({
      itemNo,
      thumb,
      full: cached.full,
      fullContentType: cached.fullContentType,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: supplierProductImages.itemNo,
      set: {
        thumb,
        full: cached.full,
        fullContentType: cached.fullContentType,
        fetchedAt: now,
      },
    });
  await db
    .update(supplierProducts)
    .set({ imageStatus: "available", imageCheckedAt: now })
    .where(eq(supplierProducts.itemNo, itemNo));

  return cached;
}

const inFlight = new Map<string, Promise<ProductImage>>();

export async function getProductImage(
  itemNo: string,
  variant: ImageVariant = "full"
): Promise<ProductImage> {
  const cached = await readCache(itemNo);
  if (cached?.fresh) return toResult(cached, variant);
  if (!cached && (await isKnownWithoutImage(itemNo))) return { found: false };

  let pending = inFlight.get(itemNo);
  if (!pending) {
    pending = withFetchSlot(async () => {
      const body = await fetchFromSupplier(itemNo);
      const stored = await store(itemNo, body);
      return stored ? toResult(stored, variant) : { found: false as const };
    }).finally(() => inFlight.delete(itemNo));
    inFlight.set(itemNo, pending);
  }

  try {
    return await pending;
  } catch (error) {
    // Serve a stale copy rather than nothing when the supplier is unavailable.
    if (cached) {
      logger.warn(
        `Serving stale image for ${itemNo}: ${error instanceof Error ? error.message : error}`
      );
      return toResult(cached, variant);
    }
    throw error;
  }
}

// For HTTP requests: never wait on the supplier, because a pending request
// occupies one of the browser's few connections to us and would hold up
// navigation. The caller warms uncached images in the background instead.
export async function getCachedProductImage(
  itemNo: string,
  variant: ImageVariant = "full"
): Promise<ProductImageResult> {
  const cached = await readCache(itemNo);
  if (cached?.fresh) return toResult(cached, variant);
  if (!cached && (await isKnownWithoutImage(itemNo))) return { found: false };
  if (cached) return toResult(cached, variant);
  return { found: false, pending: true };
}
