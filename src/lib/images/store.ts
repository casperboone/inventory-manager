import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { assortmentItemImages } from "@/db/schema";

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const FULL_SIZE = 600;
const THUMB_SIZE = 96;
const TIMEOUT_MS = 15000;

// Only ordinary public web addresses: no other protocols, and nothing that
// points back at our own network.
function assertSafeUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("That is not a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https links are supported.");
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^(127|10)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    host === "[::1]";
  if (isPrivate) {
    throw new Error("That link points to a local address.");
  }
  return url;
}

// Shops often refuse plain server requests; asking the way a browser does
// avoids most of those refusals.
const BROWSER_HEADERS = {
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "accept-language": "nl,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
};

async function download(imageUrl: string): Promise<Buffer> {
  const url = assertSafeUrl(imageUrl);
  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Could not download the image (${response.status}).`);
  }

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) {
    throw new Error("That image is too large.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error("That image is empty or too large.");
  }
  return buffer;
}

export async function saveItemImageFromUrl(
  itemId: number,
  imageUrl: string,
  sourceName?: string,
  // Search results come with a thumbnail that is always fetchable; use it
  // when the shop refuses to serve the image itself.
  fallbackUrl?: string
): Promise<void> {
  const url = assertSafeUrl(imageUrl);

  let buffer: Buffer;
  try {
    buffer = await download(imageUrl);
  } catch (error) {
    if (!fallbackUrl || fallbackUrl === imageUrl) throw error;
    buffer = await download(fallbackUrl);
  }

  // sharp fails on anything that isn't really an image, which doubles as the
  // check that we downloaded a picture and not a web page.
  let full: Buffer;
  let thumb: Buffer;
  try {
    const image = sharp(buffer).rotate();
    full = await image
      .clone()
      .resize(FULL_SIZE, FULL_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    thumb = await image
      .clone()
      .resize(THUMB_SIZE, THUMB_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new Error("That link is not an image.");
  }

  await db
    .insert(assortmentItemImages)
    .values({
      itemId,
      thumb,
      full,
      sourceUrl: url.toString(),
      sourceName: sourceName ?? url.hostname,
    })
    .onConflictDoUpdate({
      target: assortmentItemImages.itemId,
      set: {
        thumb,
        full,
        sourceUrl: url.toString(),
        sourceName: sourceName ?? url.hostname,
        createdAt: new Date(),
      },
    });
}

export async function deleteItemImage(itemId: number) {
  await db
    .delete(assortmentItemImages)
    .where(eq(assortmentItemImages.itemId, itemId));
}

export async function readItemImage(itemId: number, variant: "thumb" | "full") {
  const row = await db.query.assortmentItemImages.findFirst({
    where: eq(assortmentItemImages.itemId, itemId),
  });
  if (!row) return null;
  return Buffer.from(variant === "thumb" ? row.thumb : row.full);
}
