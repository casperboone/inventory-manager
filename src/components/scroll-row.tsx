"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const FADE = "1.5rem";

// A row of links or buttons that scrolls sideways when it doesn't fit, as on a
// phone: without a scrollbar, fading out on the side where there is more, and
// with the child marked data-active kept in view. "activeKey" says when that
// child changed, so a refresh doesn't undo the user's own scrolling.
export function ScrollRow({
  activeKey,
  className,
  children,
}: {
  activeKey?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const row = ref.current;
    if (!row) return;

    function updateFades() {
      if (!row) return;
      const end = row.scrollWidth - row.clientWidth;
      row.style.setProperty("--fade-start", row.scrollLeft > 1 ? FADE : "0px");
      row.style.setProperty("--fade-end", row.scrollLeft < end - 1 ? FADE : "0px");
    }

    updateFades();
    row.addEventListener("scroll", updateFades, { passive: true });
    const observer = new ResizeObserver(updateFades);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", updateFades);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const row = ref.current;
    const active = row?.querySelector<HTMLElement>("[data-active]");
    if (!row || !active) return;
    row.scrollTo({
      left: active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2,
      // Only a change of tab animates; a page simply opens with it in view.
      behavior: mounted.current ? undefined : "instant",
    });
    mounted.current = true;
  }, [activeKey]);

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex scroll-smooth overflow-x-auto [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(to_right,transparent,#000_var(--fade-start,0px),#000_calc(100%-var(--fade-end,0px)),transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
