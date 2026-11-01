"use client";

import { ImageWithPreview, NoImage } from "@/components/image-with-preview";
import { ProductImage } from "@/components/product-image";

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
  if (hasOwnImage) {
    return (
      <ImageWithPreview
        src={ownImageUrl(itemId, "thumb")}
        previewSrc={ownImageUrl(itemId)}
        alt={alt}
        size={size}
        className={className}
      />
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

  return <NoImage size={size} className={className} />;
}
