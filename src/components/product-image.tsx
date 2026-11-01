"use client";

import { useEffect, useRef, useState } from "react";
import { ImageWithPreview, NoImage } from "@/components/image-with-preview";

export function productImageUrl(itemNo: string, variant?: "thumb") {
  const url = `/api/product-images/${encodeURIComponent(itemNo)}`;
  return variant ? `${url}?size=${variant}` : url;
}

// The route answers right away with 202 while it fetches from the supplier, so
// a cold image never occupies a connection. These are the delays between the
// checks that pick the image up once it has arrived.
const RETRY_DELAYS_MS = [700, 1500, 3000, 6000];

// Thumbnail of a supplier product image with a larger preview on hover.
// Products without an image (the route answers 404) show an icon instead.
export function ProductImage({
  itemNo,
  alt,
  hasImage = true,
  size = 40,
  className,
}: {
  itemNo: string;
  alt: string;
  // False when we already know the supplier has no image.
  hasImage?: boolean;
  size?: number;
  className?: string;
}) {
  const [missing, setMissing] = useState(!hasImage);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  // The image failed to load: ask the route whether it is still being fetched
  // (202) or the supplier has none (404), instead of blindly retrying.
  async function checkAgain(step: number) {
    if (!mounted.current) return;
    let status: number;
    try {
      const response = await fetch(productImageUrl(itemNo, "thumb"), {
        method: "HEAD",
        cache: "no-store",
      });
      status = response.status;
    } catch {
      status = 0;
    }
    if (!mounted.current) return;

    if (status === 200) {
      setAttempt((a) => a + 1);
    } else if (status === 202 && step < RETRY_DELAYS_MS.length) {
      timer.current = setTimeout(
        () => void checkAgain(step + 1),
        RETRY_DELAYS_MS[step]
      );
    } else {
      setMissing(true);
    }
  }

  if (missing) return <NoImage size={size} className={className} />;

  return (
    <ImageWithPreview
      src={`${productImageUrl(itemNo, "thumb")}${attempt > 0 ? `&try=${attempt}` : ""}`}
      previewSrc={productImageUrl(itemNo)}
      alt={alt}
      size={size}
      className={className}
      onError={() => void checkAgain(0)}
    />
  );
}
