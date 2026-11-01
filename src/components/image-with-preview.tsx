"use client";

import { ImageOffIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const frame = (className?: string) =>
  cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white",
    className,
  );

// A thumbnail with a larger preview on hover.
export function ImageWithPreview({
  src,
  previewSrc,
  alt,
  size,
  className,
  onError,
}: {
  src: string;
  previewSrc: string;
  alt: string;
  size: number;
  className?: string;
  onError?: () => void;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        closeDelay={0}
        render={
          <div
            className={frame(className)}
            style={{ width: size, height: size }}
          />
        }
      >
        {/* A plain lazy <img>: thumbnails are pre-sized on the server, so
            nothing is resized per request and loading never blocks the page. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          onError={onError}
        />
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-auto bg-white p-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
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

export function NoImage({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <div className={frame(className)} style={{ width: size, height: size }}>
      <ImageOffIcon className="size-4 text-muted-foreground/50" />
    </div>
  );
}
