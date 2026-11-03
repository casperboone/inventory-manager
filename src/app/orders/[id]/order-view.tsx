"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderLine } from "@/db/schema";
import { formatDate, formatInputNumber, formatNumber, formatPrice } from "@/lib/format";
import type { LineProgress } from "@/lib/orders/matching";
import type { OrderDetail } from "@/lib/orders/queries";
import { orderLabel, orderReference } from "@/lib/orders/reference";
import { parseTypedNumber } from "@/lib/numbers";
import { OneOffDialog } from "@/app/order-list/one-off-dialog";
import {
  deleteDraft,
  linkDocument,
  rejectSuggestion,
  renameOrder,
  reorderShortage,
  setOrderClosed,
  setReceived,
  setResolution,
  unlinkOrderDocument,
} from "../actions";
import {
  CONFIDENCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  LineStatusBadge,
  StageBadge,
} from "../status";

type Result = { ok: true } | { ok: false; error: string };

// Runs an action, and says so when it doesn't work out.
function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, done?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) done?.();
      else toast.error(result.error);
    });
  return { pending, run };
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function OrderView({ detail }: { detail: OrderDetail }) {
  const { order, lines, documents, progress, suggestions, linkable } = detail;
  const isDraft = order.status === "draft";
  const reference = orderReference(order.id);
  const [addingOneOff, setAddingOneOff] = useState(false);
  const router = useRouter();
  const { pending, run } = useAction();

  // Matches what the review will offer; a refused line that came anyway is done.
  const unsent = lines.filter(
    (line) =>
      line.quantity > line.sentQuantity &&
      !line.resolution &&
      progress.lines.find((row) => row.id === line.id)?.status !== "delivered",
  );
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * (line.unitPrice ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <OrderHeader
        id={order.id}
        name={order.name}
        badge={
          isDraft ? (
            <Badge variant="outline">Draft</Badge>
          ) : (
            <StageBadge
              stage={progress.stage}
              closed={order.status === "closed"}
            />
          )
        }
      />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
        {!isDraft && <CopyReference reference={reference} />}
        <span>
          {isDraft
            ? `Started ${formatDate(order.createdAt)}`
            : `Sent ${formatDate(order.sentAt)}`}
        </span>
        <span>
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
        {total > 0 && <span>about {formatPrice(total)}</span>}
      </p>

      {progress.overdue && order.status === "sent" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          Sent over two weeks ago and there&apos;s still no invoice. Check
          whether it was placed, and close it if it wasn&apos;t.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {order.status !== "closed" && (
          <Button variant="outline" onClick={() => setAddingOneOff(true)}>
            <PlusIcon />
            One-off
          </Button>
        )}
        {unsent.length > 0 && order.status !== "closed" && (
          <Button
            nativeButton={false}
            render={<Link href={`/order-list/review?order=${order.id}`} />}
          >
            {isDraft ? "Review" : `Send the rest (${unsent.length})`}
          </Button>
        )}
        {order.status === "sent" && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm("Close this order? It stops being tracked.")) {
                run(() => setOrderClosed(order.id, true));
              }
            }}
          >
            <XIcon />
            Close
          </Button>
        )}
        {order.status === "closed" && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => setOrderClosed(order.id, false))}
          >
            <RotateCcwIcon />
            Reopen
          </Button>
        )}
        {isDraft && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this draft and everything on it?")) {
                run(
                  () => deleteDraft(order.id),
                  () => router.push("/orders"),
                );
              }
            }}
          >
            <Trash2Icon />
            Delete draft
          </Button>
        )}
      </div>

      {suggestions.length > 0 && (
        <Suggestions orderId={order.id} suggestions={suggestions} />
      )}

      <Panel title="Lines">
        <ul className="divide-y">
          {lines.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing on it yet.
            </li>
          )}
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              isDraft={isDraft}
              isClosed={order.status === "closed"}
              progress={progress.lines.find((row) => row.id === line.id)!}
              substitutes={detail.substitutes[line.id] ?? []}
            />
          ))}
        </ul>
      </Panel>

      {progress.extras.length > 0 && (
        <Panel title="Extra at Rust">
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            On these documents, but not on this order.
          </p>
          <ul className="divide-y">
            {progress.extras.map((extra) => (
              <li
                key={extra.itemNo}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {extra.description ?? extra.itemNo}{" "}
                  <span className="text-xs text-muted-foreground">
                    {extra.itemNo}
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatNumber(extra.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {progress.returns.length > 0 && (
        <Panel title="Returned">
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            Taken back on these invoices. Usually from an earlier delivery, so
            they don&apos;t count against this order.
          </p>
          <ul className="divide-y">
            {progress.returns.map((row, index) => (
              <li
                key={index}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {row.description ?? row.itemNo}
                </span>
                <span className="tabular-nums">{formatNumber(row.quantity)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!isDraft && (
        <Documents
          orderId={order.id}
          documents={documents}
          linkable={linkable}
          canLink={order.status === "sent"}
        />
      )}

      <OneOffDialog
        open={addingOneOff}
        orderId={order.id}
        onAdded={() => setAddingOneOff(false)}
        onClose={() => setAddingOneOff(false)}
      />
    </div>
  );
}

function OrderHeader({
  id,
  name,
  badge,
}: {
  id: number;
  name: string | null;
  badge: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const { pending, run } = useAction();

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => renameOrder(id, value),
            () => setEditing(false),
          );
        }}
      >
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Order ${id}`}
          maxLength={80}
          className="max-w-xs"
          aria-label="Order name"
        />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        {orderLabel({ id, name })}
      </h1>
      {badge}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        onClick={() => setEditing(true)}
        aria-label="Rename order"
      >
        <PencilIcon className="size-4" />
      </Button>
    </div>
  );
}

function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono underline-offset-2 hover:text-foreground hover:underline"
      aria-label={`Copy reference ${reference}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(reference);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error(`Couldn't copy. Type it instead: ${reference}`);
        }
      }}
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      {reference}
    </button>
  );
}

function LineRow({
  line,
  isDraft,
  isClosed,
  progress,
  substitutes,
}: {
  line: OrderLine;
  isDraft: boolean;
  isClosed: boolean;
  progress: LineProgress;
  substitutes: OrderDetail["substitutes"][number];
}) {
  const { pending, run } = useAction();
  const { status, shortBy } = progress;
  const isShort = status === "short" || status === "missing";
  const canTick =
    !isDraft && !isClosed && (status === "by_hand" || line.receivedQuantity > 0);

  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{line.name}</div>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
            {line.itemNo && <span>{line.itemNo}</span>}
            {line.unitOfMeasure && <span>{line.unitOfMeasure}</span>}
            {line.source && <span>{line.source}</span>}
            {!line.itemId && <span>One-off</span>}
            {line.substituteItemNo && (
              <span>Replaced by {line.substituteItemNo}</span>
            )}
          </div>
          {line.cartError && (
            <div className="text-xs text-destructive">{line.cartError}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg leading-tight font-semibold tabular-nums">
            {!isDraft && line.itemNo && `${formatNumber(progress.got)} / `}
            {formatNumber(line.quantity)}
          </div>
          {!isDraft && <LineStatusBadge status={status} />}
        </div>
      </div>

      {!isDraft && progress.onRustOrder > 0 && status === "waiting" && (
        <p className="text-xs text-muted-foreground">
          {formatNumber(progress.onRustOrder)} on a Rust order.
        </p>
      )}
      {progress.overBy > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatNumber(progress.overBy)} more than ordered.
        </p>
      )}

      {canTick && <TickOff line={line} />}

      {isShort && !isClosed && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => reorderShortage(line.id, shortBy),
                () => toast.success("Added to the current order"),
              )
            }
          >
            <PlusIcon />
            Add {formatNumber(shortBy)} to current order
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => setResolution(line.id, "accepted"))}
          >
            Accept
          </Button>
          {substitutes.map((extra) => (
            <Button
              key={extra.itemNo}
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => setResolution(line.id, "substituted", extra.itemNo))
              }
            >
              Replaced by {extra.description ?? extra.itemNo}
            </Button>
          ))}
        </div>
      )}

      {line.resolution && !isClosed && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() => run(() => setResolution(line.id, null))}
        >
          <RotateCcwIcon />
          Undo {line.resolution === "accepted" ? "accept" : "replacement"}
        </Button>
      )}
    </li>
  );
}

// For what doesn't show on an invoice. One tap for all of it, or type how much.
function TickOff({ line }: { line: OrderLine }) {
  const [value, setValue] = useState(formatInputNumber(line.receivedQuantity));
  const { pending, run } = useAction();
  const done = line.receivedQuantity >= line.quantity;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={done ? "outline" : "default"}
        disabled={pending}
        onClick={() => {
          const next = done ? 0 : line.quantity;
          setValue(formatInputNumber(next));
          run(() => setReceived(line.id, next));
        }}
      >
        {done ? <RotateCcwIcon /> : <CheckIcon />}
        {done ? "Undo" : "Got it"}
      </Button>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        or
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            const parsed = parseTypedNumber(value) ?? 0;
            if (parsed !== line.receivedQuantity) {
              run(() => setReceived(line.id, parsed));
            }
          }}
          inputMode="decimal"
          aria-label={`Amount received of ${line.name}`}
          className="h-8 w-12 rounded-md border bg-background text-center text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        received
      </label>
    </div>
  );
}

function Suggestions({
  orderId,
  suggestions,
}: {
  orderId: number;
  suggestions: OrderDetail["suggestions"];
}) {
  const { pending, run } = useAction();

  return (
    <Panel title="Could this be from Rust?">
      <ul className="divide-y">
        {suggestions.map((suggestion) => (
          <li key={suggestion.documentNo} className="space-y-2 px-3 py-2.5">
            <div>
              <div className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
                <span>{suggestion.documentNo}</span>
                <Badge variant="outline">
                  {CONFIDENCE_LABELS[suggestion.confidence]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {DOCUMENT_TYPE_LABELS[suggestion.type]},{" "}
                {formatDate(suggestion.date)}. {suggestion.reasons.join(". ")}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    linkDocument(orderId, suggestion.documentNo, "suggested"),
                  )
                }
              >
                <LinkIcon />
                Link
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() => rejectSuggestion(orderId, suggestion.documentNo))
                }
              >
                Not this one
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const SOURCE_LABELS = {
  reference: "By reference",
  followed: "From its Rust order",
  suggested: "Suggested",
  manual: "By hand",
} as const;

function Documents({
  orderId,
  documents,
  linkable,
  canLink,
}: {
  orderId: number;
  documents: OrderDetail["documents"];
  linkable: OrderDetail["linkable"];
  canLink: boolean;
}) {
  const [chosen, setChosen] = useState("");
  const { pending, run } = useAction();

  return (
    <Panel title="At Rust">
      <ul className="divide-y">
        {documents.length === 0 && (
          <li className="px-3 py-4 text-sm text-muted-foreground">
            Nothing linked yet. Check Rust after placing it, or pick one below.
          </li>
        )}
        {documents.map((document) => (
          <li
            key={document.documentNo}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 font-medium tabular-nums">
                {document.href ? (
                  <Link
                    href={document.href}
                    className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  >
                    {document.documentNo}
                    <ExternalLinkIcon className="size-3" />
                  </Link>
                ) : (
                  document.documentNo
                )}
              </div>
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
                <span>{DOCUMENT_TYPE_LABELS[document.documentType]}</span>
                <span>{formatDate(document.date)}</span>
                {document.amount != null && (
                  <span>{formatPrice(document.amount)}</span>
                )}
                <span>{SOURCE_LABELS[document.source]}</span>
              </div>
            </div>
            {canLink && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                disabled={pending}
                onClick={() =>
                  run(() => unlinkOrderDocument(orderId, document.documentNo))
                }
                aria-label={`Unlink ${document.documentNo}`}
              >
                <UnlinkIcon className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canLink && linkable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            aria-label="Rust document to link"
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Link a Rust document…</option>
            {linkable.map((document) => (
              <option key={document.documentNo} value={document.documentNo}>
                {document.documentNo} · {DOCUMENT_TYPE_LABELS[document.type]} ·{" "}
                {formatDate(document.date)}
                {document.amount != null && ` · ${formatPrice(document.amount)}`}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !chosen}
            onClick={() =>
              run(
                () => linkDocument(orderId, chosen, "manual"),
                () => setChosen(""),
              )
            }
          >
            <LinkIcon />
            Link
          </Button>
        </div>
      )}
    </Panel>
  );
}
