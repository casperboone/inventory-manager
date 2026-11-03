"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ScrollRow } from "@/components/scroll-row";
import { Badge } from "@/components/ui/badge";
import { findActiveHref } from "@/lib/section-nav";
import { cn } from "@/lib/utils";

// Pages read the database on every visit, so the underline already moves to a
// clicked tab while the page is still on its way.
function TabUnderline({ active }: { active: boolean }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors",
        active
          ? "bg-foreground"
          : pending
            ? "animate-pulse bg-foreground/50"
            : "group-hover/tab:bg-border",
      )}
    />
  );
}

// The pages of a section, attached to the app header: a bar across the whole
// window, with anything that goes for the whole section on the right.
export function SectionBar({
  label,
  sections,
  children,
}: {
  label: string;
  sections: { href: string; label: string; count?: number }[];
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeHref = findActiveHref(
    pathname,
    sections.map((section) => section.href),
  );

  return (
    <div className="relative isolate -mt-6 mb-6 lg:flex lg:items-center lg:justify-between lg:gap-6 before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:border-b before:border-border before:bg-background">
      <div
        className={cn(
          "relative min-w-0",
          children &&
            "after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-screen after:-translate-x-1/2 after:bg-border lg:after:hidden",
        )}
      >
        {/* Lines the first label up with the page, and lets the row run to the
            edge of a phone's screen. */}
        <nav aria-label={label} className="-mx-4">
          <ScrollRow activeKey={activeHref} className="px-1">
            {sections.map((section) => {
              const active = section.href === activeHref;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active || undefined}
                  className={cn(
                    "group/tab relative flex h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.label}
                  {!!section.count && (
                    <Badge variant="secondary" className="tabular-nums">
                      {section.count}
                    </Badge>
                  )}
                  <TabUnderline active={active} />
                </Link>
              );
            })}
          </ScrollRow>
        </nav>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 [&>:last-child]:ml-auto">
          {children}
        </div>
      )}
    </div>
  );
}

// Switches between views of a list on the same page. Looks different from a
// section's tabs on purpose: this filters what is here, those go somewhere else.
export function ViewTabs<View extends string>({
  label,
  current,
  onSelect,
  views,
}: {
  label: string;
  current: View;
  onSelect: (view: View) => void;
  views: { value: View; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="max-w-full">
      <ScrollRow
        activeKey={current}
        className="w-fit max-w-full gap-0.5 rounded-lg bg-border/60 p-[3px]"
      >
        {views.map((view) => {
          const active = view.value === current;
          return (
            <button
              key={view.value}
              type="button"
              aria-pressed={active}
              data-active={active || undefined}
              onClick={() => onSelect(view.value)}
              className={cn(
                "h-7 shrink-0 rounded-md px-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view.label}
            </button>
          );
        })}
      </ScrollRow>
    </div>
  );
}
