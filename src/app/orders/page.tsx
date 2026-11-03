import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatPrice } from "@/lib/format";
import {
  getDraftOverviews,
  getTrackedOrders,
  type TrackedOrder,
} from "@/lib/orders/queries";
import { orderLabel, orderReference } from "@/lib/orders/reference";
import { StageBadge } from "./status";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The document import runs as a server action from this page.
export const maxDuration = 60;

export const metadata = { title: "Orders · Inventory Manager" };

const MAX_DONE = 50;

function isDone({ order, progress }: TrackedOrder) {
  return order.status === "closed" || progress.stage === "complete";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <h2 className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function OrderRow({
  href,
  title,
  meta,
  badges,
}: {
  href: string;
  title: string;
  meta: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{title}</span>
            {badges}
          </div>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
            {meta}
          </div>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function TrackedRow({ tracked }: { tracked: TrackedOrder }) {
  const { order, lines, documents, progress } = tracked;
  const rustOrders = documents.filter((doc) => doc.documentType === "order");

  return (
    <OrderRow
      href={`/orders/${order.id}`}
      title={orderLabel(order)}
      badges={
        <>
          <StageBadge
            stage={progress.stage}
            closed={order.status === "closed"}
          />
          {progress.shortCount > 0 && (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {progress.shortCount} not delivered
            </Badge>
          )}
          {progress.overdue && (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              No invoice yet
            </Badge>
          )}
        </>
      }
      meta={
        <>
          <span>{orderReference(order.id)}</span>
          <span>Sent {formatDate(order.sentAt)}</span>
          <span>
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
          {rustOrders.length > 0 && (
            <span>{rustOrders.map((doc) => doc.documentNo).join(", ")}</span>
          )}
        </>
      }
    />
  );
}

export default async function OrdersPage() {
  const [drafts, tracked] = await Promise.all([
    getDraftOverviews(),
    getTrackedOrders({ includeClosed: true }),
  ]);
  const active = tracked.filter((row) => !isDone(row));
  const done = tracked.filter(isDone).slice(0, MAX_DONE);

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          What we set out to buy, and what came of it at Rust.
        </p>
      </div>

      {drafts.length === 0 && tracked.length === 0 && (
        <p className="rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          No orders yet. Tap + on{" "}
          <Link href="/order-list" className="underline underline-offset-4">
            the order list
          </Link>{" "}
          to start one.
        </p>
      )}

      {drafts.length > 0 && (
        <Section title="Being put together">
          {drafts.map((draft) => (
            <OrderRow
              key={draft.id}
              href={`/orders/${draft.id}`}
              title={orderLabel(draft)}
              badges={<Badge variant="outline">Draft</Badge>}
              meta={
                <>
                  <span>Started {formatDate(draft.createdAt)}</span>
                  <span>
                    {draft.lineCount} line{draft.lineCount === 1 ? "" : "s"}
                  </span>
                  {draft.total > 0 && <span>{formatPrice(draft.total)}</span>}
                </>
              }
            />
          ))}
        </Section>
      )}

      {active.length > 0 && (
        <Section title="Under way">
          {active.map((row) => (
            <TrackedRow key={row.order.id} tracked={row} />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="Done">
          {done.map((row) => (
            <TrackedRow key={row.order.id} tracked={row} />
          ))}
        </Section>
      )}
    </div>
  );
}
