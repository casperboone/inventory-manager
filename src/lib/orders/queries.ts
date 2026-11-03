import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderDocumentRejections,
  orderDocuments,
  orderLines,
  orders,
  supplierInvoiceLines,
  supplierInvoices,
  supplierOrderLines,
  supplierOrders,
  supplierProducts,
  type Order,
  type OrderDocument,
  type OrderLine,
} from "@/db/schema";
import {
  computeProgress,
  suggestDocuments,
  suggestSubstitutes,
  type OrderProgress,
  type RustDocument,
  type Suggestion,
} from "./matching";

export type LinkedDocument = OrderDocument & {
  date: Date | null;
  amount: number | null;
  // Rust orders have a page while they're open; afterwards they're just ours.
  href: string | null;
  lineCount: number;
};

export type TrackedOrder = {
  order: Order;
  lines: OrderLine[];
  documents: LinkedDocument[];
  progress: OrderProgress;
};

// Rust's documents with their lines, wherever each kind is kept.
async function loadDocuments(
  numbers: string[]
): Promise<Map<string, RustDocument & { amount: number | null; href: string | null }>> {
  const documents = new Map<
    string,
    RustDocument & { amount: number | null; href: string | null }
  >();
  if (numbers.length === 0) return documents;

  const [rustOrders, rustOrderLines, posted, postedLines] = await Promise.all([
    db.select().from(supplierOrders).where(inArray(supplierOrders.orderNo, numbers)),
    db
      .select()
      .from(supplierOrderLines)
      .where(inArray(supplierOrderLines.orderNo, numbers)),
    db
      .select()
      .from(supplierInvoices)
      .where(
        and(
          inArray(supplierInvoices.documentNo, numbers),
          ne(supplierInvoices.documentType, "order")
        )
      ),
    db
      .select()
      .from(supplierInvoiceLines)
      .where(
        and(
          inArray(supplierInvoiceLines.documentNo, numbers),
          ne(supplierInvoiceLines.documentType, "order")
        )
      ),
  ]);

  for (const order of rustOrders) {
    documents.set(order.orderNo, {
      documentNo: order.orderNo,
      type: "order",
      date: order.orderDate,
      reference: order.yourReference,
      leftOpenList: order.leftOpenListAt !== null,
      amount: order.amount,
      href:
        order.leftOpenListAt === null
          ? `/financials/orders/${encodeURIComponent(order.orderNo)}`
          : null,
      lines: rustOrderLines
        .filter((line) => line.orderNo === order.orderNo)
        .map((line) => ({
          itemNo: line.itemNo,
          description: line.description,
          quantity: line.quantity,
        })),
    });
  }
  for (const document of posted) {
    documents.set(document.documentNo, {
      documentNo: document.documentNo,
      type: document.documentType as "invoice" | "creditmemo",
      date: document.documentDate,
      reference: document.yourReference,
      orderNo: document.orderNo,
      amount: document.amount,
      href: `/financials/invoices/${encodeURIComponent(document.documentNo)}`,
      lines: postedLines
        .filter((line) => line.documentNo === document.documentNo)
        .map((line) => ({
          itemNo: line.itemNo,
          description: line.description,
          quantity: line.quantity,
        })),
    });
  }
  return documents;
}

const byLine = (a: OrderLine, b: OrderLine) => a.id - b.id;

function track(
  order: Order,
  lines: OrderLine[],
  links: OrderDocument[],
  documents: Awaited<ReturnType<typeof loadDocuments>>,
  now: Date
): TrackedOrder {
  const own = lines.filter((line) => line.orderId === order.id).sort(byLine);
  const linked = links.filter((link) => link.orderId === order.id);
  const found = linked.flatMap((link) => {
    const document = documents.get(link.documentNo);
    return document ? [document] : [];
  });
  return {
    order,
    lines: own,
    documents: linked.map((link) => {
      const document = documents.get(link.documentNo);
      return {
        ...link,
        date: document?.date ?? null,
        amount: document?.amount ?? null,
        href: document?.href ?? null,
        lineCount: document?.lines.length ?? 0,
      };
    }),
    progress: computeProgress(own, found, order.sentAt, now),
  };
}

// Everything that has left the draft stage, newest first.
export async function getTrackedOrders(
  options: { includeClosed?: boolean } = {}
): Promise<TrackedOrder[]> {
  const list = await db
    .select()
    .from(orders)
    .where(
      options.includeClosed
        ? ne(orders.status, "draft")
        : eq(orders.status, "sent")
    )
    .orderBy(desc(orders.sentAt), desc(orders.id));
  if (list.length === 0) return [];

  const ids = list.map((order) => order.id);
  const [lines, links] = await Promise.all([
    db.select().from(orderLines).where(inArray(orderLines.orderId, ids)),
    db.select().from(orderDocuments).where(inArray(orderDocuments.orderId, ids)),
  ]);
  const documents = await loadDocuments(links.map((link) => link.documentNo));
  const now = new Date();
  return list.map((order) => track(order, lines, links, documents, now));
}

export type DraftOverview = {
  id: number;
  name: string | null;
  createdAt: Date;
  lineCount: number;
  total: number;
};

export async function getDraftOverviews(): Promise<DraftOverview[]> {
  return db
    .select({
      id: orders.id,
      name: orders.name,
      createdAt: orders.createdAt,
      lineCount: sql<number>`count(${orderLines.id})`,
      total: sql<number>`coalesce(sum(${orderLines.quantity} * coalesce(${orderLines.unitPrice}, 0)), 0)`,
    })
    .from(orders)
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(eq(orders.status, "draft"))
    .groupBy(orders.id)
    .orderBy(desc(orders.id));
}

export type LinkableDocument = {
  documentNo: string;
  type: RustDocument["type"];
  date: Date | null;
  amount: number | null;
};

// Rust's newest documents that aren't on an order yet, to link one by hand.
async function getLinkableDocuments(limit = 40): Promise<LinkableDocument[]> {
  const [rustOrders, posted, linked] = await Promise.all([
    db
      .select({
        documentNo: supplierOrders.orderNo,
        date: supplierOrders.orderDate,
        amount: supplierOrders.amount,
      })
      .from(supplierOrders)
      .orderBy(desc(supplierOrders.orderDate))
      .limit(limit + 20),
    db
      .select({
        documentNo: supplierInvoices.documentNo,
        type: supplierInvoices.documentType,
        date: supplierInvoices.documentDate,
        amount: supplierInvoices.amount,
      })
      .from(supplierInvoices)
      .where(ne(supplierInvoices.documentType, "order"))
      .orderBy(desc(supplierInvoices.documentDate))
      .limit(limit + 20),
    db.select({ documentNo: orderDocuments.documentNo }).from(orderDocuments),
  ]);
  const taken = new Set(linked.map((row) => row.documentNo));
  return [
    ...rustOrders.map((row) => ({ ...row, type: "order" as const })),
    ...posted.map((row) => ({
      ...row,
      type: row.type as "invoice" | "creditmemo",
    })),
  ]
    .filter((row) => !taken.has(row.documentNo))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, limit);
}

const MAX_CANDIDATE_DAYS = 90;
const DAY_S = 24 * 60 * 60;

// Unlinked documents from around when the order went out, and not turned down.
async function getCandidates(order: Order): Promise<RustDocument[]> {
  if (!order.sentAt) return [];
  const from = new Date(order.sentAt.getTime() - 2 * DAY_S * 1000);
  const to = new Date(order.sentAt.getTime() + MAX_CANDIDATE_DAYS * DAY_S * 1000);

  const [rustOrders, posted, linked, refused] = await Promise.all([
    db
      .select({ documentNo: supplierOrders.orderNo })
      .from(supplierOrders)
      .where(
        and(gte(supplierOrders.orderDate, from), lte(supplierOrders.orderDate, to))
      ),
    db
      .select({ documentNo: supplierInvoices.documentNo })
      .from(supplierInvoices)
      .where(
        and(
          ne(supplierInvoices.documentType, "order"),
          gte(supplierInvoices.documentDate, from),
          lte(supplierInvoices.documentDate, to)
        )
      ),
    db.select({ documentNo: orderDocuments.documentNo }).from(orderDocuments),
    db
      .select({ documentNo: orderDocumentRejections.documentNo })
      .from(orderDocumentRejections)
      .where(eq(orderDocumentRejections.orderId, order.id)),
  ]);
  const skip = new Set(
    [...linked, ...refused].map((row) => row.documentNo)
  );
  const numbers = [...rustOrders, ...posted]
    .map((row) => row.documentNo)
    .filter((no) => !skip.has(no));
  const documents = [...(await loadDocuments(numbers)).values()];

  // Linking a Rust order brings its invoice along, so offering both is noise.
  const rustOrderNumbers = new Set(
    documents.filter((doc) => doc.type === "order").map((doc) => doc.documentNo)
  );
  return documents.filter(
    (doc) => !(doc.orderNo && rustOrderNumbers.has(doc.orderNo))
  );
}

export type OrderDetail = TrackedOrder & {
  // Per line, what the product is called at Rust.
  descriptions: Record<string, string | null>;
  suggestions: Suggestion[];
  linkable: LinkableDocument[];
  // Per short line, what may have come instead.
  substitutes: Record<number, OrderProgress["extras"]>;
};

export async function getOrderDetail(
  orderId: number
): Promise<OrderDetail | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order) return null;

  const [lines, links] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, orderId)),
    db.select().from(orderDocuments).where(eq(orderDocuments.orderId, orderId)),
  ]);
  const documents = await loadDocuments(links.map((link) => link.documentNo));
  const tracked = track(order, lines, links, documents, new Date());

  const itemNos = lines.flatMap((line) => (line.itemNo ? [line.itemNo] : []));
  const products =
    itemNos.length > 0
      ? await db
          .select({
            itemNo: supplierProducts.itemNo,
            description: supplierProducts.description,
          })
          .from(supplierProducts)
          .where(inArray(supplierProducts.itemNo, itemNos))
      : [];
  const descriptions = Object.fromEntries(
    products.map((product) => [product.itemNo, product.description])
  );

  const open = order.status === "sent" && tracked.progress.stage !== "complete";
  const [candidates, linkable] = open
    ? await Promise.all([getCandidates(order), getLinkableDocuments()])
    : [[], []];

  const substitutes: OrderDetail["substitutes"] = {};
  for (const line of tracked.lines) {
    const status = tracked.progress.lines.find((row) => row.id === line.id)?.status;
    if (status !== "short" && status !== "missing") continue;
    const found = suggestSubstitutes(
      line.itemNo ? (descriptions[line.itemNo] ?? line.name) : line.name,
      tracked.progress.extras
    );
    if (found.length > 0) substitutes[line.id] = found;
  }

  return {
    ...tracked,
    descriptions,
    suggestions: open
      ? suggestDocuments(order, tracked.lines, tracked.progress.lines, candidates)
      : [],
    linkable,
    substitutes,
  };
}

export type NotDeliveredLine = {
  order: { id: number; name: string | null; sentAt: Date | null };
  line: OrderLine;
  status: "short" | "missing";
  got: number;
  shortBy: number;
};

// Everything that should have come and hasn't, over all open orders, and the
// orders that have gone quiet.
export async function getNotDelivered() {
  const tracked = await getTrackedOrders();
  const lines: NotDeliveredLine[] = tracked.flatMap(
    ({ order, lines, progress }) =>
      lines.flatMap((line) => {
        const row = progress.lines.find((entry) => entry.id === line.id);
        if (row?.status !== "short" && row?.status !== "missing") return [];
        return [
          {
            order: { id: order.id, name: order.name, sentAt: order.sentAt },
            line,
            status: row.status,
            got: row.got,
            shortBy: row.shortBy,
          },
        ];
      })
  );
  const overdue = tracked
    .filter(({ progress }) => progress.overdue)
    .map(({ order }) => ({ id: order.id, name: order.name, sentAt: order.sentAt }));
  return { lines, overdue };
}
