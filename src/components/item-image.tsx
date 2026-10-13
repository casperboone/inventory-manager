"use client";

import { ImageOffIcon } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export function ownImageUrl(itemId: number, variant?: "thumb") {
  const url = `/api/assortment-images/${itemId}`;
  return variant ? `${url}?size=${variant}` : url;
}

// The picture for an assortment item: our own image when there is one, the
// supplier's otherwise, and a placeholder when neither exists.
export function ItemImage({
  itemId,
  itemNo,
  hasOwnImage,
  imageStatus,
  alt,
  size = 40,
  className,
}: {
  itemId: number;
  itemNo: string | null;
  hasOwnImage: boolean;
  imageStatus: "available" | "none" | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  const frame = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white",
    className
  );

  if (hasOwnImage) {
    return (
      <HoverCard>
        <HoverCardTrigger
          delay={150}
          closeDelay={0}
          render={
            <div className={frame} style={{ width: size, height: size }} />
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ownImageUrl(itemId, "thumb")}
            alt={alt}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className="size-full object-contain"
          />
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          className="w-auto bg-white p-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ownImageUrl(itemId)}
            alt={alt}
            width={256}
            height={256}
            loading="lazy"
            decoding="async"
            className="size-64 object-contain"
          />
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (itemNo) {
    return (
      <ProductImage
        itemNo={itemNo}
        alt={alt}
        hasImage={imageStatus !== "none"}
        size={size}
        className={className}
      />
    );
  }

  return (
    <div className={frame} style={{ width: size, height: size }}>
      <ImageOffIcon className="size-4 text-muted-foreground/50" />
    </div>
  );
}
